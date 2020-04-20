import fs from "fs";

if (
  !process.argv[1] ||
  !process.argv[2] ||
  !process.argv[3] ||
  process.argv[3] === "--h" ||
  process.argv[3] === "--help"
) {
  console.log(`Roam export processor
usage: node index.mjs export.filename.json [--action] [pagename]

for example
--duplicates to display a list of page names we think are duplicates
--full to render a page with contents and linked references
--mentions to render only the linked references of a page
--text to render only the text of a page
--query to run a query, first list positive tags separated by comma, then optionally negative tags, so for example 
  node index.mjs roam.json --query 'Peter Thiel,Roam' 'Note taking'
  would return all blocks that mention Peter and Roam, but not Note taking.
--tags shows you all the related tags (like the filter menu) sorted alphabetically, useful to run before running a query`);
  process.exit(0);
}

const file = fs.readFileSync(process.argv[2], "utf-8");
const pagesRaw = JSON.parse(file);

const blocks = {};
const blocksWithChildren = {};
const pages = {};

if (process.argv[3] === "--duplicates") {
  const titles = pagesRaw.map((x) => x.title).filter((x) => x.trim() !== "");
  const mapping = {};
  titles.forEach((title) => {
    let simpleTitle = title.toLowerCase().replace(/[^A-Za-z0-9]/g, "");
    if (!mapping[simpleTitle]) {
      mapping[simpleTitle] = [];
    }
    mapping[simpleTitle].push(title);
  });
  console.log("Possible duplicates, simple algorithm: \n");
  Object.keys(mapping).forEach((key) => {
    if (mapping[key].length > 1) {
      console.log(mapping[key].map((x) => `[[${x}]]`).join(" "));
    }
  });
  process.exit(0);
}

const linkedReferences = {};

// could probably be done much faster with a proper parser etc, but seems to work
const getNestedLinks = (text) => {
  let links = [];
  let state = "normal"; // 'seenOne'
  let counter = 0;
  let currentLinks = [];
  text.split("").forEach((char) => {
    currentLinks.forEach((x, i) => (currentLinks[i] += char));
    if (state === "seenOne" && char !== "[") {
      state = "normal";
    }
    if (state === "seenOneOut" && char !== "]") {
      state = "normal";
    }
    if (char === "[") {
      counter += 1;
      if (state === "seenOne") {
        currentLinks.push("");
        state = "normal";
      } else if (state === "normal") {
        state = "seenOne";
      }
    }
    if (char === "]" && counter > 0) {
      counter -= 1;
      if (state === "seenOneOut") {
        const l = currentLinks.pop();
        if (l) {
          links.push(l.slice(0, -2));
        }
        state = "normal";
      } else if (state === "normal") {
        state = "seenOneOut";
      }

      if (counter === 0) {
        state = "normal";
      }
    }
  });
  return links;
};

const extractLinks = (text, uid) => {
  let links = [];
  const newText = text.replace("#[[", "[[");
  links = links.concat(getNestedLinks(newText));
  newText.replace(/#([a-z0-9_-]+)/g, (_, link) => links.push(link));
  return links;
};

const childrenRecursively = (children, indent, path, page) => {
  const output = children
    .map((child) => {
      if (child.string.trim() === "") {
        return "";
      }
      let text = `${"  ".repeat(indent * 2)}- ${(
        child.title || child.string
      ).trim()}\n`;
      const links = extractLinks(child.string, child.uid);
      blocks[child.uid] = [child.string, links];
      if (links) {
        links.forEach((link) => {
          if (!linkedReferences[link]) {
            linkedReferences[link] = [];
          }
          linkedReferences[link].push(child.uid);
        });
      }
      if (child.children) {
        text += childrenRecursively(
          child.children,
          indent + 1,
          path.concat(child.string),
          page
        );
      }
      blocksWithChildren[child.uid] = [
        page,
        path,
        text.trim().split("\n").join("\n"),
      ];
      return text;
    })
    .join("");

  return output;
};

pagesRaw.forEach((page) => {
  if (page.children) {
    pages[page.title] = childrenRecursively(page.children, 0, [], page.title);
    blocksWithChildren[page.uid] = [page, [], pages[page.title]];

    const links = extractLinks(page.title);
    if (links) {
      links.forEach((link) => {
        if (!linkedReferences[link]) {
          linkedReferences[link] = [];
        }

        linkedReferences[link].push(page.uid);
      });
    }
  }
});

const processText = (text) => {
  if (!text) {
    return "";
  }
  return text
    .replace(/\{\{embed: \(\((.+?)\)\)\}\}/g, (hit, uid) => {
      if (blocksWithChildren[uid]) {
        return blocksWithChildren[uid][2]
          .split("\n")
          .map((x) => x.substring(1))
          .join("\n");
      }
    })
    .replace(/\(\((.+?)\)\)/g, (hit, uid) => {
      if (blocks[uid]) {
        return blocks[uid][0];
      }
      return hit;
    });
};

const trimString = (str, maxLength) => {
  if (str.length < maxLength) {
    return str;
  } else {
    return str.substring(0, maxLength) + "...";
  }
};

const renderLinkedReferences = (refs) => {
  return refs
    .map((f) => {
      const b = blocksWithChildren[f];
      let indent = 2;
      if (b) {
        let text = `# [[${b[0]}]]\n`;
        if (b[1].length > 0) {
          text += `  - ${b[1].map((x) => trimString(x, 50)).join(" > ")}\n`;
          indent += 2;
        }
        text += `${b[2]
          .trim()
          .split("\n")
          .map((x) => " ".repeat(indent) + x)
          .join("\n")}\n`;
        return text;
      } else {
        return "";
      }
    })
    .join("");
};

const action = process.argv[3];
const pagename = process.argv[4];

if (action === "--full") {
  console.log(`=== ${process.argv[4]} ===`);
  console.log(processText(pages[process.argv[4]]));
  console.log("\n\nBacklinks\n");
  console.log(renderLinkedReferences(linkedReferences[process.argv[4]]));
}

if (action === "--text") {
  console.log(`=== ${process.argv[4]} ===`);
  console.log(processText(pages[process.argv[4]]));
}

if (action === "--mentions") {
  console.log(`=== ${process.argv[4]} ===`);
  console.log("\n\nBacklinks\n");
  console.log(renderLinkedReferences(linkedReferences[process.argv[4]]));
}

if (action == "--query") {
  let queryPos = process.argv[4];
  if (queryPos) {
    queryPos = queryPos.split(",").map((x) => x.trim());
  }
  let queryNeg = process.argv[5];

  if (queryNeg) {
    queryNeg = queryNeg.split(",").map((x) => x.trim());
  }
  const firstMatches = linkedReferences[queryPos[0]];
  const queryMatches = firstMatches.filter((x) => {
    if (queryPos.some((tag) => !blocks[x][1].includes(tag))) {
      return false;
    }
    if (queryNeg && queryNeg.some((tag) => blocks[x][1].includes(tag))) {
      return false;
    }
    return true;
  });
  console.log(renderLinkedReferences(queryMatches));
}

if (action == "--tags") {
  const ref = linkedReferences[process.argv[4]];
  let tags = [];
  ref.forEach((x) => (tags = tags.concat(blocks[x][1])));
  console.log([...new Set(tags)].sort());
}
