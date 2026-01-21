# Deployment Instructions for Hostinger VPS

## Option 1: Simple Deployment (No Docker)

### Step 1: SSH into your VPS
```bash
ssh root@your-vps-ip
```

### Step 2: Create app directory
```bash
mkdir -p /var/www/education-app
cd /var/www/education-app
```

### Step 3: Upload files
Upload these files to `/var/www/education-app/`:
- index.html
- styles.css
- app.js
- server.js
- package.json

You can use SCP from your local machine:
```bash
scp -r "C:\Users\viete\OneDrive\Desktop\RAG Education\app\*" root@your-vps-ip:/var/www/education-app/
```

### Step 4: Install dependencies and start
```bash
cd /var/www/education-app
npm install
```

### Step 5: Install PM2 (process manager)
```bash
npm install -g pm2
pm2 start server.js --name education-app
pm2 save
pm2 startup
```

### Step 6: Configure Nginx (add to your existing config)

Create `/etc/nginx/sites-available/education-app`:
```nginx
server {
    listen 80;
    server_name app.srv1263678.hstgr.cloud;  # Or your domain

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/education-app /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### Step 7: Add SSL with Let's Encrypt
```bash
certbot --nginx -d app.srv1263678.hstgr.cloud
```

---

## Option 2: Docker Deployment (if you have Docker)

### Step 1: Upload files
```bash
scp -r "C:\Users\viete\OneDrive\Desktop\RAG Education\app\*" root@your-vps-ip:/var/www/education-app/
```

### Step 2: Build and run
```bash
cd /var/www/education-app
docker build -t education-app .
docker run -d --name education-app -p 3000:3000 --restart unless-stopped education-app
```

---

## Quick Commands

### Check if app is running:
```bash
pm2 status
# or
curl http://localhost:3000
```

### View logs:
```bash
pm2 logs education-app
```

### Restart app:
```bash
pm2 restart education-app
```

### Update app (after uploading new files):
```bash
cd /var/www/education-app
pm2 restart education-app
```

---

## Subdomain Setup on Hostinger

If you want a custom subdomain like `app.yourdomain.com`:

1. Go to Hostinger DNS settings
2. Add an A record:
   - Name: `app`
   - Points to: Your VPS IP
3. Wait for DNS propagation (few minutes)
4. Update Nginx config with your domain
5. Run certbot for SSL
