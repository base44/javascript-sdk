# SDK Documentation

Documentation for the SDK is generated using TypeDoc. The TypeDoc files are post-processed to convert them to Mintlify format. You can preview the output locally, and then push it to the docs repo to delpoy it.

## Before getting started
* Install the repo dependencies: `npm install`
* Install the Mintlify CLI: `npm i -g mint`

## Generate docs
Open the terminal in the repo and run `npm run create-docs`. The docs files appear under `/docs/content`.

## Preview docs locally with Mintlify
1. In the terminal, navigate to the `docs` folder.
1. Run `mint dev`. The docs preview opens in your browser.

> If you notice that the names appearing for the sections of the docs menu aren't right, you may need to adjust `scripts/mintlify-post-processing/category-map.json`. This file  maps the names of the subfolders in `/docs/content` to the desired section names in the reference.

### Category mapping
`scripts/mintlify-post-processing/category-map.json` maps the names of the output folders from TypeDoc to the names of the categories that you want to appear in the docs. Only folder names that are mapped in this file appear in the final docs and the local preview.

For example, if you map `interfaces` to `Modules`, the files in `docs/content/interfaces` appear in the docs under a **Modules** category.

The names of the TypeDoc output folders are: `classes`, `functions`, `interfaces`, `type-aliases`.

## Control which types appear in the docs
`scripts/mintlify-post-processing/types-to-expose.json` lists the TypeDoc types that the post-processing script keeps in the generated reference. Add or remove type names in that file to expose different SDK areas (for example, to surface a new type or hide one that is not ready for publication). After editing the list, rerun `npm run create-docs` so the Mintlify-ready content reflects the updated exposure set.

## Push SDK docs to the Mintlify docs repository

After generating and reviewing the docs, you can push them to the `base44/mintlify-docs` repo to deploy them.

1. In the terminal, run `npm run push-docs -- --branch <choose-a-branch-name>`. If the branch already exists, your changes are added to the ones already on the branch. Otherwise, the script creates a new branch with the chosen name.
1. Open the [docs repo](https://github.com/base44-dev/mintlify-docs) and created a PR for your branch.
1. Preview your docs using the [Mintlify dashboard](https://dashboard.mintlify.com/base44/base44?section=previews).