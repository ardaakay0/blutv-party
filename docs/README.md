# BluTV Party Download Page

This directory contains files for setting up a GitHub Pages site to host the BluTV Party extension download.

## Setup Instructions

### 1. Create the extension.zip file

First, you need to create the extension.zip file that users will download:

1. Locate the `extension` folder in your project
2. Create a ZIP archive of the entire folder:
   - Windows: Right-click > Send to > Compressed (zipped) folder
   - Mac: Right-click > Compress "extension"
3. Rename the resulting ZIP file to `extension.zip`
4. Place the `extension.zip` file in this `docs` folder

### 2. Set up GitHub Pages

1. Push this `docs` folder to your GitHub repository
2. Go to your repository on GitHub
3. Go to Settings > Pages
4. Under "Source", select "Deploy from a branch"
5. Select the branch that contains your docs folder (usually `main` or `master`)
6. Select `/docs` as the folder
7. Click Save

### 3. Your download page will be available at:

`https://[your-username].github.io/blutv-party/`

## Customizing the Page

You can edit the `index.html` file to customize the appearance or information on the download page.

### Important Elements to Update:

1. The download button link (`<a href="extension.zip">`) should point to your extension ZIP file
2. The GitHub repository links should point to your actual repository
3. Update any other information to match your project's specifics 