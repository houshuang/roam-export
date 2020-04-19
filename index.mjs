import fs from "fs";
import fuzz from "fuzzball";

const file = fs.readFileSync(process.argv[2], "utf-8");
const pagesRaw = JSON.parse(file);

const blocks = {};
const blocksWithChildren = {};
const pages = {};

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
      let text = `${"  ".repeat(indent * 2)}- ${child.title || child.string}\n`;
      blocks[child.uid] = child.string;
      const links = extractLinks(child.string, child.uid);
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
        text
          .split("\n")
          .map((x) => x.substring(indent * 2))
          .join("\n"),
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
  return text.replace(/\(\((.+?)\)\)/g, (hit, uid) => {
    if (blocks[uid]) {
      return blocks[uid];
    }
    return hit;
  });
};

const trimString = (str, maxLength) => {
  if (str.length < maxLength) {
    return str;
  } else {
    return str.substring(maxLength) + "...";
  }
};

const renderLinkedReferences = (link) => {
  return linkedReferences[link]
    .map((f) => {
      const b = blocksWithChildren[f];
      if (!b) {
        console.log(f, blocksWithChildren[f]);
      }
      if (b) {
        return `# ${b[0]}\n${b[1].map((x) => trimString(x, 50)).join(" > ")}\n${
          b[2]
        }\n\n`;
      } else {
        return "";
      }
    })
    .join("");
};

if (pages[process.argv[3]]) {
  console.log(`=== ${process.argv[3]} ===`);
  console.log(processText(pages[process.argv[3]]));
  console.log("\n\nBacklinks\n");
  console.log(renderLinkedReferences(process.argv[3]));
}

// const titles = contents.map(x => x.title).filter(x => x.trim() !== "");
// const mapping = {};
// titles.forEach(title => {
//   let simpleTitle = title.toLowerCase().replace(/[^A-Za-z0-9]/g, "");
//   if (!mapping[simpleTitle]) {
//     mapping[simpleTitle] = [];
//   }
//   mapping[simpleTitle].push(title);
// });
// console.log("Possible duplicates, simple algorithm: \n");
// Object.keys(mapping).forEach(key => {
//   if (mapping[key].length > 1) {
//     console.log(mapping[key].map(x => `[[${x}]]`).join(" "));
//   }
// });

// console.log("\n\nFuzzy algorithm");

// options.keepmap = true;
// const dedupe = fuzz.dedupe(titles, options);
// dedupe
//   .filter(f => f[2].length > 1).
//   .forEach(x => console.log(`${x[2].map(y => `[[${y[0]}]]`).join(" ")}`));
