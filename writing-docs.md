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

## Push SDK docs to the Mintlify docs repository

After generating and reviewing the docs, you can push them to the `base44/mintlify-docs` repo to deploy them.

1. In the terminal, run `npm run push-docs -- --branch <choose-a-branch-name>`. If the branch already exists, your changes are added to the ones already on the branch. Otherwise, the script creates a new branch with the chosen name.
1. Open the [docs repo](https://github.com/base44-dev/mintlify-docs) and created a PR for your branch.
1. Preview your docs using the [Mintlify dashboard](https://dashboard.mintlify.com/base44/base44?section=previews).