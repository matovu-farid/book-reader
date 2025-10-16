# book-reader

An Electron application with React and TypeScript featuring text-to-speech functionality powered by OpenAI's TTS API.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Features

- **EPUB Reader**: Read EPUB books with customizable themes
- **Text-to-Speech**: AI-powered narration using OpenAI's TTS API
- **Smart Caching**: Audio files are cached locally for faster playback
- **Paragraph Highlighting**: Visual feedback during audio playback
- **Navigation Controls**: Play, pause, previous/next paragraph controls
- **Auto Page Navigation**: Seamlessly moves between pages during reading

## Project Setup

### Prerequisites

- Node.js (v16 or higher)
- OpenAI API key for text-to-speech functionality

### TTS Setup

1. **Get OpenAI API Key**:

   - Visit [OpenAI Platform](https://platform.openai.com/)
   - Create an account and generate an API key
   - Ensure you have credits available for TTS usage

2. **Configure Environment Variable**:

   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

3. **Restart Application**:
   - Restart the application after setting the API key
   - TTS controls will appear in the top-right corner when configured

For detailed TTS usage instructions, see [TTS User Guide](docs/TTS_USER_GUIDE.md).

### Install

```bash
$ npm install
```

### OpenAI API Setup

1. Get your OpenAI API key from [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a `.env` file in the project root:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```
3. The TTS controls will automatically appear in the book reader when an API key is configured

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
