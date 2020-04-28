import util from "util";
import fs from "fs";
import chrono from "chrono-node";

util.inspect.defaultOptions.depth = null;

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
--tags shows you all the related tags (like the filter menu) sorted alphabetically, useful to run before running a query
--replaceUrls replaces all links with external URLs, and removes links that have no external URLs
--export exports a page as Markdown, converting URLs and bullets
--exportHTML exports a pag , converting URLs
--urls lists page names and their related URLs
--urlsJS lists page names and their related URLs as JS output
--wordCount shows word count and longest block`);
  process.exit(0);
}

const file = fs.readFileSync(process.argv[2], "utf-8");
const pagesRaw = JSON.parse(file);

const blocks = {};
const blocksWithChildren = {};
const pages = {};
const urls = {};

if (process.argv[3] === "--duplicates") {
  const titles = pagesRaw.map(x => x.title).filter(x => x.trim() !== "");
  const mapping = {};
  titles.forEach(title => {
    let simpleTitle = title.toLowerCase().replace(/[^A-Za-z0-9]/g, "");
    if (!mapping[simpleTitle]) {
      mapping[simpleTitle] = [];
    }
    mapping[simpleTitle].push(title);
  });
  console.log("Possible duplicates, simple algorithm: \n");
  Object.keys(mapping).forEach(key => {
    if (mapping[key].length > 1) {
      console.log(mapping[key].map(x => `[[${x}]]`).join(" "));
    }
  });
  process.exit(0);
}

const linkedReferences = {};
const parentLinkedReferences = {};

// could probably be done much faster with a proper parser etc, but seems to work
const getNestedLinks = text => {
  let links = [];
  let state = "normal"; // 'seenOne'
  let counter = 0;
  let currentLinks = [];
  text.split("").forEach(char => {
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

const parseQuery = text => {
  text = text.trim();
  if (text[0] === "{") {
    text = text.slice(1, -1);
  }
  let [word, ...rest] = text.split(":");
  rest = rest.join(":").trim();
  let components = [];
  let index = 0;
  let c = 0;
  let mode = "normal"; // 'embedded'
  let res = "";
  rest.split("").forEach((char, i) => {
    if (char === "{") {
      if (mode === "normal") {
        mode = "embedded";
        if (res.trim().length > 0) {
          components = components.concat(getNestedLinks(res));
          index = components.length - 1;
          res = "";
          index += 1;
        }
      }
      res += char;
      c += 1;
    } else if (char === "}") {
      if (mode === "normal") {
        console.error(`Didn't expect to see } here`, i);
      } else {
        res += char;
        c -= 1;
        if (c === 0) {
          components[index] = parseQuery(res);
          index += 1;
          mode = "normal";
          res = "";
        }
      }
    } else {
      res += char;
    }
  });
  if (res.length > 0) {
    components = components.concat(getNestedLinks(res));
  }
  return { [word]: components };
};

const extractLinks = (text, uid) => {
  let links = [];
  const newText = text.replace("#[[", "[[");
  links = links.concat(getNestedLinks(newText));
  newText.replace(/#([a-z0-9_-]+)/g, (_, link) => links.push(link));
  return links;
};

const urlRe = new RegExp("^https?:");

const childrenRecursively = (
  children,
  indent,
  path,
  page,
  parentLink,
  parentLinks,
  pathUids
) => {
  const output = children
    .map(child => {
      if (urlRe.test(child.string)) {
        if (parentLink && !urls[parentLink]) {
          urls[parentLink] = [child.string.trim(), 1];
        } else {
          if (path.length === 0 && (!urls[page] || urls[page][1] > 0)) {
            if (urls[page]) {
            }
            urls[page] = [child.string.trim(), 0];
          }
        }
      }

      if (child.string.trim() === "") {
        return "";
      }
      let text = `${"  ".repeat(indent * 2)}- ${(
        child.title || child.string
      ).trim()}\n`;
      const links = extractLinks(child.string, child.uid);
      blocks[child.uid] = [
        child.string,
        links,
        parentLinks,
        pathUids,
        child["edit-time"],
        child["create-time"]
      ];
      let mdURL;
      const findMD = child.string.match(/\[link\]\((.+?)\)/);
      if (findMD) {
        mdURL = findMD[1];
      }
      if (links) {
        if (mdURL) {
          urls[links[0]] = [mdURL.trim(), 0];
        }
        links.forEach(link => {
          if (!linkedReferences[link]) {
            linkedReferences[link] = [];
          }
          linkedReferences[link].push(child.uid);
        });
        links.concat(parentLinks).forEach(link => {
          if (!parentLinkedReferences[link]) {
            parentLinkedReferences[link] = [];
          }
          parentLinkedReferences[link].push(child.uid);
        });
      }
      if (child.children) {
        text += childrenRecursively(
          child.children,
          indent + 1,
          path.concat(child.string),
          page,
          links && links[0],
          links.concat(parentLinks),
          pathUids.concat(child.uid)
        );
      }
      blocksWithChildren[child.uid] = [
        page,
        path,
        text
          .trim()
          .split("\n")
          .join("\n")
      ];
      return text;
    })
    .join("");

  return output;
};

pagesRaw.forEach(page => {
  if (page.children) {
    pages[page.title] = childrenRecursively(
      page.children,
      0,
      [],
      page.title,
      undefined,
      [],
      [page.title]
    );
    const pageLinks = extractLinks(page.title);
    blocksWithChildren[page.title] = [page.title, pageLinks, pages[page.title]];
    blocks[page.title] = [
      page.title,
      pageLinks,
      [],
      [],
      page["edit-time"],
      page["create-time"]
    ];

    if (pageLinks) {
      pageLinks.forEach(link => {
        if (!linkedReferences[link]) {
          linkedReferences[link] = [];
        }

        linkedReferences[link].push(page.uid);
      });
    }
  }
});

Object.keys(linkedReferences).forEach(x => {
  if (!blocks[x]) {
    blocks[x] = [x, extractLinks(x), [], [], null, null];
  }
});

const processText = text => {
  if (!text) {
    return "";
  }
  return text
    .replace(/\{\{embed: \(\((.+?)\)\)\}\}/g, (hit, uid) => {
      if (blocksWithChildren[uid]) {
        return blocksWithChildren[uid][2]
          .split("\n")
          .map(x => x.substring(1))
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

const renderLinkedReferences = refs => {
  return refs
    .map(f => {
      const b = blocksWithChildren[f];
      let indent = 2;
      if (b) {
        let text = `# [[${b[0]}]]\n`;
        if (b[1].length > 0) {
          text += `  - ${b[1].map(x => trimString(x, 50)).join(" > ")}\n`;
          indent += 2;
        }
        text += `${processText(b[2])
          .trim()
          .split("\n")
          .map(x => " ".repeat(indent) + x)
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
    queryPos = queryPos.split(",").map(x => x.trim());
  }
  let queryNeg = process.argv[5];

  if (queryNeg) {
    queryNeg = queryNeg.split(",").map(x => x.trim());
  }
  const firstMatches = linkedReferences[queryPos[0]];
  const queryMatches = firstMatches.filter(x => {
    if (queryPos.some(tag => !blocks[x][1].includes(tag))) {
      return false;
    }
    if (queryNeg && queryNeg.some(tag => blocks[x][1].includes(tag))) {
      return false;
    }
    return true;
  });
  console.log(renderLinkedReferences(queryMatches));
}

if (action == "--tags") {
  const ref = linkedReferences[process.argv[4]];
  let tags = [];
  ref.forEach(x => (tags = tags.concat(blocks[x][1])));
  console.log([...new Set(tags)].sort());
}

if (action === "--links") {
  console.log("export default [");
  Object.keys(linkedReferences).forEach(x => console.log("`" + x + "`,"));
  console.log("]");
}

if (action === "--blocks") {
  console.log("export default {");
  Object.keys(blocks).forEach(x => {
    console.log(`"` + x + '": `' + blocks[x][0].replace(/`/g, "'") + "`,");
  });
  console.log("}");
}

if (action === "--blockEmbeds") {
  console.log("export default {");
  Object.keys(blocksWithChildren).forEach(x => {
    console.log(
      `"` + x + '": `' + blocksWithChildren[x][2].replace(/`/g, "'") + "`,"
    );
  });
  console.log("}");
}

const replaceUrls = (text, markdown) => {
  return text.replace(/\[\[(.+?)\]\]/g, (_, x) => {
    if (urls[x]) {
      if (markdown) {
        return `[${x}](${urls[x][0]})`;
      } else {
        return `<a href="${urls[x][0]}>${x}</a>`;
      }
    } else {
      return x;
    }
  });
};

const reformatText = text => {
  const lines = text.split("\n");
  const output = "";
  const header = 0;
  const newL = lines.map(x => {
    const dash = x.indexOf("-");
    const indent = dash / 4;
    const text = x.substr(dash + 1);
    return [indent, text];
  });
  let bullet = undefined;
  newL.forEach((f, i) => {
    if (i > 0 && newL[i - 1][0] !== f[0]) {
      bullet = undefined;
    }
    let header = "";
    if (newL[i + 1] && newL[i + 1][0] > f[0]) {
      header = "#".repeat(f[0] + 1) + " ";
    }
    if (header === "" && bullet === undefined) {
      bullet = true;
      let stop = false;
      let c = i;
      while (!stop) {
        if (c > newL.length || c[0] !== f[0]) {
          stop = true;
        }
        if (newL[c][1].length > 110) {
          bullet = false;
        }
      }
    }
    console.log(`${bullet || false ? "- " : ""}${header}${f[1].trim()}\n`);
  });
};

if (action === "--export") {
  const text = reformatText(
    replaceUrls(processText(pages[process.argv[4]]), true)
  );
}

if (action === "--exportHTML") {
  const text = replaceUrls(processText(pages[process.argv[4]]));
  console.log(text);
}

if (action === "--replaceURLs") {
  const text = replaceUrls(processText(pages[process.argv[4]]), true);
  console.log(text);
}

if (action === "--urls") {
  Object.keys(urls).forEach(x => {
    console.log(`${x}\t${urls[x][0]}`);
  });
}

if (action === "--urlsJS") {
  console.log("export default {");
  Object.keys(urls).forEach(u =>
    console.log(
      `"${u.replace(/"/g, "")}": "${urls[u][0].replace(/"/g, "%20")}",`
    )
  );
  console.log("}");
}

if (action === "--wordCount") {
  let w = 0;
  let wMax = 0;
  let wMaxId = undefined;
  let lMax = 0;
  let lMaxId = undefined;
  Object.keys(blocks).forEach(b => {
    const wCur = blocks[b][0].match(/\S+/g).length;
    w += wCur;
    const lCur = blocks[b][1].length;
    if (lCur > lMax) {
      lMax = lCur;
      lMaxId = b;
    }
    if (wCur > wMax) {
      wMax = wCur;
      wMaxId = b;
    }
  });
  console.log(
    `You have ${Object.keys(blocks).length} blocks, and ${
      Object.keys(pages).length
    } pages. In total, ${w} words.`
  );
  console.log(`Longest block: ${blocks[wMaxId]}`);
  console.log(`Block with the most links: ${blocks[lMaxId]}`);
}

if (action === "--parseQuery") {
  console.log(parseQuery(process.argv[4]));
}

const roamRe = RegExp(/.+\d\d?.+, \d\d\d\d/);

const isRoamDate = string => roamRe.test(string);

const RoamDates = {};

const convertRoamDate = string => {
  if (RoamDates[string]) {
    return RoamDates[string];
  }
  const res = chrono.parseDate(string).getTime();
  RoamDates[string] = res;
  return res;
};

const evaluators = {
  and: (block, pieces) =>
    pieces.every(piece => {
      if (typeof piece === "string") {
        const res = block[2].concat(block[3]).includes(piece);
        if (res) {
          // console.log(block, piece, res);
        }
        return res;
      } else {
        const res = evaluators[Object.keys(piece)[0]](
          block,
          Object.values(piece)[0]
        );
        return res;
      }
    }),
  not: (block, pieces) =>
    pieces.every(piece => !block[2].concat(block[3]).includes(piece)),
  or: (block, pieces) =>
    pieces.some(piece => block[2].concat(block[3]).includes(piece)),
  between: (block, pieces) => {
    pieces = pieces.map(x => convertRoamDate(x));
    const matchingDates = block[2].concat(block[3]).filter(x => isRoamDate(x));
    return matchingDates.some(x => {
      const d = convertRoamDate(x);
      if (d >= pieces[0] && d <= pieces[1]) {
        return true;
      } else {
        return false;
      }
    });
  },
  substring: (block, pieces) => block[1].includes(pieces[0]),
  startsWith: (block, pieces) => block[1].startsWith(pieces[0]),
  has: (block, pieces) =>
    block[1].includes(pieces[0] === "highlight" ? "^^" : "**"),
  betweenCreate: (block, pieces) => {
    pieces = pieces.map(x => convertRoamDate(x));
    const matchingDates = block[2].concat(block[3]).filter(x => isRoamDate(x));
    const d = block[6];
    if (d >= pieces[0] && d <= pieces[1]) {
      return true;
    } else {
      return false;
    }
  },
  betweenUpdate: (block, pieces) => {
    pieces = pieces.map(x => convertRoamDate(x));
    const matchingDates = block[2].concat(block[3]).filter(x => isRoamDate(x));
    const d = block[5];
    console.log(pieces, d);
    if (d >= pieces[0] && d <= pieces[1]) {
      return true;
    } else {
      return false;
    }
  }
};

const filterBlocks = blocks => {
  blocks.sort((x, y) => x[4].length - y[4].length);
  const seen = {};
  return blocks.filter(b => {
    if (b[4].some(x => seen[x])) {
      return false;
    }
    seen[b[0]] = true;
    return true;
  });
};

if (action === "--runQuery") {
  const blocksToProcess = Object.keys(blocks).map(x => [x, ...blocks[x]]);
  const query = parseQuery(process.argv[4]);
  const results = Object.values(blocksToProcess).filter(block =>
    evaluators[Object.keys(query)[0]](block, Object.values(query)[0])
  );
  const finalBlocks = filterBlocks(results);
  console.log(renderLinkedReferences(finalBlocks.map(x => x[0])));
}

if (action === "--runQueryBlocksOnly") {
  const blocksToProcess = Object.keys(blocks).map(x => [x, ...blocks[x]]);
  const query = parseQuery(process.argv[4]);
  const results = Object.values(blocksToProcess).filter(block =>
    evaluators[Object.keys(query)[0]](block, Object.values(query)[0])
  );
  const finalBlocks = filterBlocks(results);
  finalBlocks.forEach(x => console.log(x[1]));
}
