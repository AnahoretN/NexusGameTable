<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Nexus Game Table v0.0.5 - Virtual Tabletop for Board Games

A virtual tabletop platform for playing board games online with friends.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the app (server + client start together on one port):
   ```bash
   npm run dev
   ```

3. Open your browser:
   - Local: http://localhost:5173
   - Network: use the network URL shown in terminal to play with friends on the same network

## Features

- **Virtual tabletop** with drag-and-drop tokens, cards, and dice
- **Multiplayer** - create rooms and invite friends
- **Real-time sync** - all players see the same game state
- **Card decks** - shuffle, draw, and play cards
- **Dice rolling** - physical dice objects with random results
- **Custom content** - add your own tokens and images

## How to Play

1. **Host a game:** Open the app and create a room. Share the room ID with friends.
2. **Join a game:** Enter the room ID to join an existing game.
3. **Game master tools:** Lock objects, control visibility, manage players.
