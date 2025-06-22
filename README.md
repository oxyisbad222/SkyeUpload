# SkyeUpload 🔺🔻


- SkyeUpload is your personal media server and client application, designed for streaming your very own content\! 🎬 

- It boasts a sleek, web-based client that can be added right to your homescreen as a Progressive Web App (PWA) 📱,   
    
- Includes a powerful server with an admin panel for effortlessly managing your media library. 💖

## Features:

### Client (PWA)

* Browse Media: A user-friendly interface, similar to Kodi or Hulu, for browsing your media library.  
* Cross-device Sync: Your viewing history and settings are synced across all your devices.  
* PWA Support: Can be "installed" on your iOS or Android homescreen for a native-app-like experience.  
* Request Content: A dedicated tab for users to request new content from the admin.  
* Search: Easily find content within your library.

### Server & Admin Panel

* Content Upload: Upload MP4 files, or add content via magnet links, .torrent files, and direct download URLs.  
* Server Status: A dashboard to monitor the server's health and performance.  
* Request Management: View and manage content requests from users.  
* User Management: (Future feature) Manage who has access to your media server.

## Tech Stack:

* Backend: Node.js with Express.js  
* Frontend: HTML, CSS, JavaScript (as a PWA)  
* Database: (To be determined \- likely a simple, file-based DB like SQLite for ease of setup)  
* Torrenting: WebTorrent or a similar library to handle magnet links and .torrent files.

## Getting Started:

*(This section will be updated with detailed setup and deployment instructions)*

1. Clone the repository:  
   git clone https://github.com/your-github-username/SkyeUpload.git

2. Install dependencies:  

   ` cd SkyeUpload/server   
    npm install ` 
    cd ../client 
    npm install `

4. Configure the server:  
   * Create a .env file in the server directory.  
   * Add necessary configuration (e.g., secret keys, admin password).  
5. Run the application:  
   `cd ../server`  
   `npm start`

## Developer Note ❣️

This project is lovingly crafted by Skye.

*This is a personal, open-source project. Please feel free to contribute, but be aware that it's designed for personal use and may not have all the features of a commercial media server.*
