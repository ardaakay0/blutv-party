# BluTV Party Deployment Guide

This guide will help you deploy the BluTV Party application to Amazon Lightsail.

## Prerequisites

1. An AWS account with Lightsail access
2. A Lightsail instance running Ubuntu
3. SSH access to your Lightsail instance

## Deployment Steps

1. **Create a Lightsail Instance**
   - Go to AWS Lightsail console
   - Click "Create instance"
   - Choose Ubuntu as the platform
   - Select an instance plan (recommended: at least 1GB RAM)
   - Choose a region close to your users
   - Create instance

2. **Configure Firewall Rules**
   - In Lightsail console, go to your instance's networking tab
   - Add the following firewall rules:
     - HTTP (80)
     - HTTPS (443)
     - Custom TCP (3000)

3. **Deploy the Application**
   ```bash
   # Connect to your instance
   ssh ubuntu@your-instance-ip

   # Clone the repository
   git clone your-repository-url
   cd blutv-party

   # Make the deployment script executable
   chmod +x deploy/deploy.sh

   # Run the deployment script
   ./deploy/deploy.sh
   ```

4. **Set up SSL (Optional but Recommended)**
   ```bash
   # Install Certbot
   sudo apt install certbot python3-certbot-nginx

   # Get SSL certificate
   sudo certbot --nginx -d your-domain.com
   ```

## Monitoring

- View application logs: `pm2 logs`
- Monitor application status: `pm2 status`
- Restart application: `pm2 restart blutv-party`

## Troubleshooting

1. If the application fails to start:
   - Check logs: `pm2 logs`
   - Verify port 3000 is not in use: `sudo lsof -i :3000`
   - Check Node.js version: `node --version`

2. If you can't connect to the application:
   - Verify firewall rules in Lightsail
   - Check if the application is running: `pm2 status`
   - Check application logs: `pm2 logs` 