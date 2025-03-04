const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const path = require('path');

// Create a 512x512 canvas
const canvas = createCanvas(512, 512);
const ctx = canvas.getContext('2d');

// Helper function for rounded rectangles (for older Node.js versions)
function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

// Fill with a solid color
ctx.fillStyle = '#4285f4';
ctx.fillRect(0, 0, 512, 512);

// Draw a phone icon
ctx.fillStyle = 'white';
// Phone outline
drawRoundedRect(ctx, 156, 56, 200, 400, 30);
ctx.fill();

// Screen
ctx.fillStyle = '#333';
drawRoundedRect(ctx, 176, 96, 160, 280, 5);
ctx.fill();

// Home button
ctx.fillStyle = '#666';
ctx.beginPath();
ctx.arc(256, 410, 24, 0, 2 * Math.PI);
ctx.fill();

// Arrow
ctx.fillStyle = '#00c853';
ctx.beginPath();
ctx.moveTo(236, 236);
ctx.lineTo(286, 186);
ctx.lineTo(336, 236);
ctx.lineTo(306, 236);
ctx.lineTo(306, 296);
ctx.lineTo(266, 296);
ctx.lineTo(266, 236);
ctx.closePath();
ctx.fill();

// Write the icon file
const outputDir = path.join(__dirname, 'build');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const buffer = canvas.toBuffer('image/png');
fs.writeFileSync(path.join(outputDir, 'icon.png'), buffer);

console.log('Created 512x512 icon for macOS at build/icon.png'); 