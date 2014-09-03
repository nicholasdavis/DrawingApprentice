window.requestAnimFrame = (function () {
    return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function ( /* function */ callback, /* DOMElement */ element) {
        window.setTimeout(callback, 1000 / 60);
    };
})();


var points = [],
    currentPoint = 1,
    nextTime = new Date().getTime(),
    timeinterval = 100; //replace with timestamp [i+1] - timestamp [i]
    
// make some points
for (var i = 0; i < 50; i++) {
    points.push({
        x: i * (canvas.width/50), //point x[i]
        y: 100+Math.sin(i) * 10   //point y[i]
    });
}

function draw() {
    
    if(new Date().getTime() > nextTime){
        nextTime = new Date().getTime() + timeinterval;
        
        currentPoint++;
        if(currentPoint > points.length){
            currentPoint = 0;
        }
    }
    ctx.clearRect(0,0,canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgb(255,0,0)';
    ctx.fillStyle = 'rgb(255,0,0)';
    for (var p = 1, plen = currentPoint; p < plen; p++) {
        ctx.lineTo(points[p].x, points[p].y);
    }
    ctx.stroke();
    
    requestAnimFrame(draw);
}

draw();