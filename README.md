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

When the server starts, it will display its IP address and port like this:
```
Server running on port 3000
Available on:
  http://192.168.1.5:3000
```

**IMPORTANT**: Note down this IP address - this is what everyone will need to use to connect to your server, NOT "localhost".

### Step 2: Install the Extension (Everyone)

1. Download this extension
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the `extension` folder

### Step 3: Create a Room

1. Navigate to any BluTV video
2. Click the BluTV Party extension icon
3. Enter the server URL - use the IP address shown when you started the server, like: `http://192.168.1.5:3000`
4. Click "Create New Room"
5. Share the Room ID with your friends

### Step 4: Join a Room

1. Navigate to the same BluTV video
2. Click the BluTV Party extension icon
3. Enter the server URL (the IP address from Step 1, NOT "localhost")
4. Enter the Room ID shared by the host
5. Click "Join"

## Connection Types

### Same Local Network (Same WiFi)

If everyone is on the same WiFi network:
1. Use the local IP address displayed when the server starts (looks like `192.168.x.x`)
2. Everyone enters this address in the Server URL field

### Different Networks (Internet)

To connect with people on different networks:

#### Option 1: Port Forwarding
1. Access your router's admin panel (usually http://192.168.1.1)
2. Set up port forwarding for port 3000 to your computer
3. Find your public IP (visit whatismyip.com)
4. Share this public IP with port 3000 with others (http://your.public.ip:3000)

#### Option 2: Use ngrok (Easiest)
1. Install [ngrok](https://ngrok.com/)
2. Run `ngrok http 3000`
3. Share the https URL ngrok provides
4. Everyone uses this URL for the server connection

#### Option 3: Cloud Server
For a permanent solution, deploy the server to a cloud provider like AWS, Google Cloud, or Heroku.

## Advanced Configuration

### Changing the Server Port

If port 3000 is already in use:

1. Edit the `server/server.js` file
2. Change the port number in the line: `const port = process.env.PORT || 3000;`
3. Restart the server

## Troubleshooting

### Connection Issues

- Make sure you're using the correct server URL - not "localhost"
  - For local network: use the server's local IP (192.168.x.x)
  - For internet: use public IP or ngrok URL
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
