# BluTV Party

Watch BluTV videos together with friends in perfect sync, no matter where they are.

## How It Works

BluTV Party uses a server-based approach to synchronize video playback between multiple viewers. This approach is similar to how Minecraft servers work - one person runs a small server on their computer, and everyone connects to that server to stay in sync.

### Key Features

- **Easy to use**: Create a room, share the ID, and watch together
- **Perfect synchronization**: Video playback is kept in sync across all viewers
- **Low resource usage**: Minimal server requirements
- **Works behind firewalls**: No complex peer-to-peer connections

## Quick Start

### Step 1: Run the Server (One Person Only)

Someone in your group needs to run the server. This is a simple process:

1. Make sure you have [Node.js](https://nodejs.org/) installed (version 18 or higher)
2. Open a terminal/command prompt
3. Navigate to the `server` folder of this project
4. Run the following commands:

```bash
npm install
npm start
```

The server will start and display its IP address. Copy this address to share with friends.

### Step 2: Install the Extension (Everyone)

1. Download this extension
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the `extension` folder

### Step 3: Create a Room

1. Navigate to any BluTV video
2. Click the BluTV Party extension icon
3. Enter the server URL (the IP address and port from Step 1)
4. Click "Create New Room"
5. Share the Room ID with your friends

### Step 4: Join a Room

1. Navigate to the same BluTV video
2. Click the BluTV Party extension icon
3. Enter the server URL (same as the host)
4. Enter the Room ID shared by the host
5. Click "Join"

## Advanced Configuration

### Using a Public Server

If you want to make the server accessible outside your local network:

1. Configure port forwarding on your router (forward port 8080 to your computer)
2. Use your public IP address when sharing the server URL
3. Consider using a service like [ngrok](https://ngrok.com/) for temporary public access

### Changing the Server Port

If port 8080 is already in use:

1. Edit the `server/server.js` file
2. Change the port number in the line: `const port = process.env.PORT || 8080;`
3. Restart the server

## Troubleshooting

### Connection Issues

- Ensure everyone is using the same server URL
- Verify the server is running before trying to connect
- Check firewall settings if connecting outside your network
- Try refreshing the BluTV page and reconnecting

### Sync Issues

- If videos get out of sync, the person experiencing the issue can click "Request Sync"
- Ensure everyone is on the same video
- If issues persist, try leaving and rejoining the room

## Privacy & Security

This extension operates entirely within your browser and your local network. No data is sent to external servers unless you specifically configure a public server.

## Development

Built with:
- HTML/CSS/JavaScript (Extension)
- Node.js & Socket.IO (Server)

## License

MIT License
