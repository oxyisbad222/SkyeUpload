# Use the official Node.js 20 image as a base
FROM node:20-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the server's package.json and package-lock.json
COPY server/package*.json ./

# Install server dependencies
RUN npm install

# Copy the rest of the server's code into the container
COPY server/ .

# Expose the port the app runs on
EXPOSE 3000

# The command to start the server
CMD [ "node", "server.js" ]
