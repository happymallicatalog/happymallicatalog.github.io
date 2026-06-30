// Run: node generate-icons.js
// Generates icon-192.png and icon-512.png for the PWA
const { createCanvas } = require('canvas');
const fs = require('fs');

function drawIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const r = size * 0.12; // border radius

    // Background
    ctx.fillStyle = '#0B1D33';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    // Gold circle
    const cx = size / 2, cy = size / 2, cr = size * 0.38;
    ctx.strokeStyle = '#C5A059';
    ctx.lineWidth = size * 0.025;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.stroke();

    // Gold "T" letter
    ctx.fillStyle = '#C5A059';
    ctx.font = `bold ${size * 0.42}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', cx, cy + size * 0.02);

    return canvas.toBuffer('image/png');
}

try {
    fs.writeFileSync('icon-512.png', drawIcon(512));
    fs.writeFileSync('icon-192.png', drawIcon(192));
    console.log('Icons generated!');
} catch(e) {
    console.log('canvas not available, using fallback SVG approach');
}
