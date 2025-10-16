# TTS Audio Feature User Guide

## Overview

The Text-to-Speech (TTS) feature allows you to listen to your books being read aloud using AI-generated speech. This feature provides a hands-free reading experience with high-quality audio.

## Prerequisites

### OpenAI API Key Setup

1. **Obtain API Key**: Visit [OpenAI Platform](https://platform.openai.com/) and create an API key
2. **Set Environment Variable**: Add your API key to your system environment:
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```
3. **Restart Application**: Restart the book reader application after setting the API key

## Using TTS

### Basic Controls

#### Play Button

- **Location**: Top-right corner of the book reader
- **Function**: Starts reading the current paragraph aloud
- **Requirements**:
  - OpenAI API key must be configured
  - Current page must have text paragraphs

#### Pause/Resume

- **Pause**: Click the play button while audio is playing
- **Resume**: Click the play button while audio is paused
- **Visual Indicator**: Button changes to pause icon when playing

#### Stop Button

- **Function**: Stops audio playback and resets to beginning
- **Effect**: Clears paragraph highlighting and resets playback state

#### Navigation Controls

##### Previous Paragraph

- **Function**: Moves to the previous paragraph
- **Behavior**:
  - If at start of page: navigates to previous page
  - If playing: continues playback with previous paragraph

##### Next Paragraph

- **Function**: Moves to the next paragraph
- **Behavior**:
  - If at end of page: automatically navigates to next page
  - If playing: continues playback with next paragraph

### Auto-Advance Feature

When audio finishes playing a paragraph, the system automatically:

1. **Advances to Next Paragraph**: Moves to the next paragraph in sequence
2. **Page Navigation**: If at the end of a page, automatically turns to the next page
3. **Continuous Playback**: Continues reading without interruption

### Visual Feedback

#### Progress Indicator

- **Location**: Bottom-right of TTS controls
- **Format**: "Current / Total" (e.g., "3 / 15")
- **Meaning**: Shows current paragraph position within the page

#### Paragraph Highlighting

- **Active Paragraph**: Currently being read is highlighted
- **Color**: Blue highlight indicates active paragraph
- **Synchronization**: Highlight moves with audio playback

#### Loading States

- **Spinner**: Shows when generating audio
- **Button States**: Controls are disabled during loading
- **Status**: Loading indicator appears in play button

## Error Handling

### Common Issues and Solutions

#### "OpenAI API key not configured"

- **Cause**: API key not set or application not restarted
- **Solution**:
  1. Set `OPENAI_API_KEY` environment variable
  2. Restart the application
  3. Verify key is valid on OpenAI platform

#### "No paragraphs available to play"

- **Cause**: Current page has no readable text content
- **Solution**: Navigate to a page with text content

#### "Audio playback failed"

- **Cause**: Network issues or audio file corruption
- **Solution**:
  1. Check internet connection
  2. Try playing again (automatic retry)
  3. Clear cache if issues persist

#### "Failed to generate audio"

- **Cause**: OpenAI API issues or rate limiting
- **Solution**:
  1. Wait a moment and try again
  2. Check OpenAI service status
  3. Verify API key has sufficient credits

### Error Notifications

#### Error Snackbar

- **Appearance**: Red notification at top of screen
- **Duration**: 6 seconds (auto-dismiss)
- **Action**: Click X to dismiss immediately

#### Error Icon

- **Location**: TTS controls area
- **Appearance**: Red error icon when error occurs
- **Purpose**: Visual indicator of error state

## Performance Tips

### Optimal Usage

1. **Stable Internet**: Ensure good internet connection for API calls
2. **Sufficient Credits**: Monitor OpenAI API usage and credits
3. **Cache Management**: Let the system cache audio files for faster playback
4. **Page Navigation**: Use TTS controls for navigation during playback

### Cache Benefits

- **Faster Playback**: Previously generated audio loads instantly
- **Reduced API Calls**: Cached audio doesn't require new API requests
- **Offline Capability**: Cached audio works without internet (limited)

## Advanced Features

### Automatic Page Navigation

- **Smart Navigation**: System detects when you reach the end of a page
- **Seamless Transition**: Automatically turns pages during continuous playback
- **Direction Detection**: Handles forward/backward navigation appropriately

### Prefetching

- **Background Generation**: System generates audio for upcoming paragraphs
- **Smooth Experience**: Reduces waiting time between paragraphs
- **Intelligent Caching**: Balances cache size with performance

### Memory Management

- **Automatic Cleanup**: System manages memory usage efficiently
- **Cache Limits**: Prevents excessive disk usage (500MB limit)
- **State Management**: Clean state when switching books

## Troubleshooting

### Audio Not Playing

1. Check if TTS controls are visible (requires API key)
2. Verify internet connection
3. Check OpenAI API key validity
4. Try refreshing the page

### Slow Performance

1. Check internet speed
2. Clear browser cache
3. Restart application
4. Check OpenAI API status

### Cache Issues

1. Clear TTS cache (if option available)
2. Restart application
3. Check disk space availability

### Navigation Issues

1. Use TTS controls for navigation during playback
2. Avoid manual page navigation while playing
3. Use stop button before manual navigation

## Best Practices

### For Optimal Experience

1. **Set Up API Key**: Ensure OpenAI API key is properly configured
2. **Stable Connection**: Use reliable internet connection
3. **Monitor Usage**: Keep track of OpenAI API usage and costs
4. **Use Controls**: Use TTS controls instead of manual navigation during playback

### For Performance

1. **Let It Cache**: Allow system to cache audio files
2. **Avoid Interruptions**: Don't manually navigate while playing
3. **Clear Cache Periodically**: Clear cache if experiencing issues

### For Cost Management

1. **Monitor API Usage**: Track OpenAI API calls and costs
2. **Use Caching**: Leverage cached audio to reduce API calls
3. **Selective Use**: Use TTS for important sections rather than entire books

## Limitations

### Current Limitations

1. **Internet Required**: API calls require internet connection
2. **API Costs**: OpenAI API usage incurs costs
3. **Rate Limits**: API has rate limiting (handled automatically)
4. **Voice Options**: Currently uses default voice (alloy)
5. **Speed Control**: Playback speed not adjustable

### Known Issues

1. **Page Navigation**: Manual navigation during playback may cause issues
2. **Long Paragraphs**: Very long paragraphs may timeout
3. **Special Characters**: Some special characters may not be pronounced correctly
4. **Empty Pages**: Pages without text content cannot be played

## Support

### Getting Help

1. **Check Error Messages**: Read error notifications carefully
2. **Restart Application**: Try restarting if experiencing issues
3. **Check Logs**: Look for error messages in console
4. **Verify Setup**: Ensure API key is properly configured

### Reporting Issues

When reporting issues, please include:

1. Error message text
2. Steps to reproduce
3. Book type and content
4. System information
5. Internet connection status
