# Nova Music Selfbot
**Credit: Darky**

A full-featured Discord music selfbot

---

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Add your token(s)**  
   Edit `tokens.txt` — one token per line.

3. **Configure Lavalink**  
   Edit `config.json` with your Lavalink node details:
   ```json
   {
     "nodes": [
       {
         "name": "main",
         "host": "localhost",
         "port": 2333,
         "auth": "youshallnotpass",
         "secure": false
       }
     ]
   }
   ```

4. **Start**
   ```
   npm start
   ```

---

## Commands

| Command | Description |
|---|---|
| `play <query/url>` | Play a song or playlist |
| `skip` | Skip current track |
| `stop` | Stop and clear queue |
| `np` | Now playing |
| `queue` | Show queue |
| `volume [1-1000]` | Get/set volume |
| `seek <seconds>` | Seek to position |
| `pause` | Toggle pause/resume |
| `shuffle` | Shuffle queue |
| `loop <track/queue/off>` | Loop mode |
| `clear` | Clear queue |
| `replay` | Push current to #1 |
| `filter <name>` | Apply audio filter |
| `filters` | List filters |
| `tts <text>` | Hindi TTS |
| `use <guild_id> [vc_id]` | Set context |
| `bots` | List bots |
| `guilds` | List guilds |
| `nodes` | Lavalink status |
| `status <online/idle/dnd>` | Change presence |
| `exit` | Shut down |

## Source Prefixes
- `sp` Spotify · `yt` YouTube · `sc` SoundCloud
- `js` JioSaavn · `am` Apple Music · `dz` Deezer

## Audio Filters
lofi · nightcore · slowmo · chipmunk · darthvader · daycore · damon · 8d · tremolo · vibrate · bassboost · earrape · 121 · dis · loud
