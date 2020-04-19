# roam-export

This is a script that parses the JSON export from Roam, and does various things with it. Very early stages, and ugly code, but already surprisingly useful.

To run, just make sure you're using Node 13.5 or higher. It has no dependencies.

If you run it without arguments, it will display this help text. 

```
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
```

# Duplicates
Currently uses a very simple algorithm (basically removing everything but a-z A-Z and then comparing, which catches both errors in capitalization, but also spaces, dashes etc.

![](https://i.imgur.com/qgjkgtN.png)

If you paste this into Roam, you can click the links to rename, or you can just leave it there and at least you'll get a backlink from each page pointing to the other version.

# Exporting single pages

The script automatically resolves both embeds and block-references. (It can't handle queries yet, but that's actually quite doable!). The output can be tweaked in the future. 

Here's an example of just the page contents
![](https://i.imgur.com/SD7dQTd.png)

Just the backlinks
![](https://i.imgur.com/Ca51ulx.png)

Everything
![](https://i.imgur.com/ad6uXSb.png)

Everything, pasted into Roam
![](https://i.imgur.com/RT7WdxT.png)

# Tags and queries

Looking up tags

![](https://i.imgur.com/WZ9hEFk.png)

Positive `and` query

![](https://i.imgur.com/lMHBe11.png)

Adding negative `not` query

![](https://i.imgur.com/PtIuxWl.png)


# Lot's more can be done
To follow. (Suggestions welcome)
