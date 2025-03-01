# BluTV Party Extension

Watch BluTV content synchronously with friends! This Chrome extension allows you to create watch parties for BluTV videos.

## Project Structure
- `extension/` - Chrome extension files
- `server/` - WebSocket server for synchronization
- `docs/` - Documentation and installation guide

## Development
1. Server:
   ```bash
   cd server
   npm install
   npm start
   ```

2. Extension:
   - Open Chrome
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

## Deployment
The server is deployed on Railway.app at `blutv-party-production.up.railway.app`

## Installation Guide
Visit [https://[your-github-username].github.io/blutv-party](https://[your-github-username].github.io/blutv-party) for installation instructions.
