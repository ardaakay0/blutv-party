#!/bin/bash

# Update system
echo "Updating system..."
sudo apt update && sudo apt upgrade -y

# Install Node.js and npm
echo "Installing Node.js and npm..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
echo "Installing PM2..."
sudo npm install -g pm2

# Install project dependencies
echo "Installing project dependencies..."
cd server
npm install
cd ..

# Start the application with PM2
echo "Starting application with PM2..."
pm2 start ecosystem.config.js
pm2 save

# Setup PM2 to start on system boot
echo "Setting up PM2 to start on boot..."
pm2 startup | tail -n 1 > pm2-startup.sh
chmod +x pm2-startup.sh
sudo ./pm2-startup.sh

echo "Deployment completed!" 