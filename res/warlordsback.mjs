import {
    WebSocketServer
} from 'ws';

const wss = new WebSocketServer({
    port: 8333
});

wss.on('connection', function connection(ws) {
    if (wss.clients.size >= 4) {
        console.log("FULL GAME. CLOSING CLIENT.");
        ws.send(JSON.stringify({
            type: 'ERROR',
            msg: 'Game full. Try again, later!',
        }));
        ws.close();
        return;
    }

    ws.clientId = Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1); // Random 4 digit hex. Unique.
    ws.name = ws.clientId;  // Default name is id. Name is not unique.
    ws.ready = false;

    ws.send(JSON.stringify({
        type: 'ID',
        id: ws.clientId
    }));

    // Add new player.
    ws.player = new Player(ws.clientId, wss.clients.size - 1);

    // Send all players.
    let playerList = [...wss.clients.values()].map(({ player }) => ({ id: player.id, idx: player.idx, name: player.name }));
    // let playerList = allPlayers.map(({ id, idx }) => ({ id, idx }));
    for (let client of wss.clients) {
        client.send(JSON.stringify({ type: 'MATCH', players: playerList }));
    }

    ws.on('message', function message(data) {
        console.log(ws.clientId, "-", data.toString());
        let input = JSON.parse(data.toString());
        if (input.type === 'NAME') {
            // ws.name = input.name;
            ws.player.name = input.name;

            // Send all players.
            let playerList = [...wss.clients.values()].map(({ player }) => ({ id: player.id, idx: player.idx, name: player.name }));
            for (let client of wss.clients) {
                client.send(JSON.stringify({ type: 'MATCH', players: playerList }));
            }
        } else if (input.type === 'READY') {
            ws.ready = true;

            // If all players are there. Might disable?
            // if (wss.clients.size === 4) {
            let all_ready = true;
            for (let client of [...wss.clients.values()]) {
                console.log("CLIENT:", client.clientId, client.ready);
                if (!client.ready) {
                    all_ready = false;
                    break;
                }
            };

            if (all_ready) countdown(wss);
            // }
        } else if (input.type === 'MOVE') {
            // if (ws.opponent && ws.opponent !== "WAIT" && ws.opponent.ready) {
            //     ws.opponent.send(data.toString());
            // }
            wss.clients.forEach(client => client.send(JSON.stringify({ ...input, id: ws.clientId })));
        }
    });
});

console.log("SERVER IS UP!");


// const allPlayers = [];

function countdown(wss) {
    // [...wss.clients.values()].forEach((v, i) => allPlayers.push(new Player(playerPos[i], playerColors[i])));
    console.log("STARTING COUNTDOWN!");
    let num = 3;
    let counter = setInterval(() => {
        wss.clients.forEach(client => client.send(JSON.stringify({ type: 'START', num })));
        num -= 1;

        if (num < 0) {
            clearInterval(counter);
            gameloop(wss);
        }
    }, 1000);
}

const fps = Math.ceil(1000 / 30);
function gameloop(wss) {
    let allPlayers = [...wss.clients.values()].map(client => client.player);
    let gamelooper = setInterval(() => {
        let currPlayers = allPlayers.filter(player => player.alive);
        if (currPlayers.length === 1) {
            console.log("GAME OVER!");
            clearInterval(gamelooper);
            return;
        }

        ball.move();
        currPlayers.forEach(player => player.checkCollisionBall(ball));

        let playerPos = currPlayers.map(({ x, y, alive }) => ({ x, y, alive }));

        wss.clients.forEach(client => client.send(JSON.stringify({
            type: 'TICK', state: {
                ballPos: { x: ball.x, y: ball.y },
                playerPos
            }
        })));
    }, fps);
}

const canvas = {
    width: 500,
    height: 500,
}

function intersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    // Check if none of the lines are of length 0
    if ((x1 === x2 && y1 === y2) || (x3 === x4 && y3 === y4)) { return false }

    denominator = ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1))

    // Lines are parallel
    if (denominator === 0) { return false }

    let ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator
    let ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator

    // is the intersection along the segments
    if (ua < 0 || ua > 1 || ub < 0 || ub > 1) { return false }

    // Return a object with the x and y coordinates of the intersection
    let x = x1 + ua * (x2 - x1)
    let y = y1 + ua * (y2 - y1)

    return { x, y }
}

const playerColors = ['green', 'blue', 'red', 'goldenrod'];
const playerPos = ['NW', 'SE', 'NE', 'SW'];

class Player {
    // constructor(pos, color) {
    constructor(id, idx) {
        this.id = id;
        this.idx = idx;

        this.pos = playerPos[idx];
        this.color = playerColors[idx];

        this.shield = new Square(this.pos, this.color, SquareType.SHIELD);
        this.king = new Square(this.pos, this.color, SquareType.KING);

        this.alive = true;

        this.setName(id);
    }

    move(evt) {
        if (this.alive) this.shield.move(evt);
    }

    // draw() {
    //     if (this.alive) {
    //         this.shield.draw();
    //         this.king.draw();
    //     }
    // }

    checkCollisionBall(ball) {
        if (this.alive) {
            this.shield.checkCollisionBall(ball);
            let hitKing = this.king.checkCollisionBall(ball);
            if (hitKing) this.alive = false;
        }
    }

    setName(name) {
        this.name = name;
        this.king.name = name;
    }
}

const SquareType = {
    SHIELD: 0,
    WALL: 1,
    KING: 2,
}
class Square {
    allThickness = [10, 15, 20];
    allOffsets = [175, 150, 50];

    constructor(pos, color, type = SquareType.SHIELD) {
        this.type = type;
        this.offset = this.allOffsets[this.type];
        this.thickness = this.allThickness[this.type];
        this.name = "????";

        if (pos == "NW") {
            this.x = 0 + this.offset;
            this.y = 0 + this.offset;
        }
        else if (pos == "NE") {
            this.x = canvas.wposth - this.offset;
            this.y = 0 + this.offset;
        }
        else if (pos == "SE") {
            this.x = canvas.wposth - this.offset;
            this.y = canvas.height - this.offset;
        }
        else if (pos == "SW") {
            this.x = 0 + this.offset;
            this.y = canvas.height - this.offset;
        }
        this.pos = pos;
        this.color = color;
        this.position = this.offset;

        // if (this.type === SquareType.KING) {
        //     this.kingPath = new Path2D();
        //     this.kingPath.rect(this.x - this.thickness, this.y - this.thickness, this.thickness * 2, this.thickness * 2);
        // }
    }

    move(evt) {
        this.position += evt.movementX;
        if (this.position > ((this.offset * 2) - this.thickness)) this.position = (this.offset * 2) - this.thickness;
        else if (this.position < this.thickness) this.position = this.thickness;
    }

    // draw() {
    //     let xPart, yPart;

    //     if (this.position < this.offset) {
    //         xPart = this.position;
    //         yPart = this.offset;
    //     }
    //     else {
    //         xPart = this.offset;
    //         yPart = this.offset - (this.position - this.offset);
    //     }

    //     if (this.pos == "NW") {
    //         // this.x = xPart;
    //         // this.y = yPart;
    //         this.x = yPart;
    //         this.y = xPart;
    //     }
    //     else if (this.pos == "NE") {
    //         this.x = canvas.width - xPart;
    //         this.y = yPart;
    //     }
    //     else if (this.pos == "SE") {
    //         // this.x = canvas.width - xPart;
    //         // this.y = canvas.height - yPart;
    //         this.x = canvas.width - yPart;
    //         this.y = canvas.height - xPart;
    //     }
    //     else if (this.pos == "SW") {
    //         this.x = xPart;
    //         this.y = canvas.height - yPart;
    //     }

    //     let block = new Path2D();
    //     block.rect(this.x - this.thickness, this.y - this.thickness, this.thickness * 2, this.thickness * 2)
    //     ctx.fillStyle = this.color;
    //     // ctx.fillRect(this.x - this.thickness, this.y - this.thickness, this.thickness * 2, this.thickness * 2);
    //     ctx.fill(block);

    //     if (this.type === SquareType.KING) {
    //         this.kingPath = block;
    //         ctx.fillStyle = 'white';
    //         ctx.textAlign = "center";
    //         ctx.font = "bold 10pt sans-serif"
    //         ctx.fillText(this.name, this.x, this.y + 5);
    //     }
    // }

    checkIntersectionBall(ball, x3, y3, x4, y4) {
        // See above for details on intersect().
        // console.log("BALL:", ball, x3, y3, x4, y4);
        let result = intersect(ball.prevX, ball.prevY, ball.x, ball.y, x3, y3, x4, y4);
        // console.log("INTERSECT: ", result);

        // For debug outlines in the global draw();
        // p1x = ball.prevX;
        // p1y = ball.prevY;
        // p2x = ball.x;
        // p2y = ball.y;
        // p3x = x3;
        // p3y = y3;
        // p4x = x4;
        // p4y = y4;

        return result;
    }

    checkCollisionBall(ball) {
        if (!(
            ball.x > this.x + this.thickness + ball.thickness
            || ball.y > this.y + this.thickness + ball.thickness
            || this.x > ball.x + this.thickness + ball.thickness
            || this.y > ball.y + this.thickness + ball.thickness
        )) {
            // console.log("COLLISION");

            let p = false;
            if (ball.prevY < this.y) {  // TOP
                // Check for intersecting vectors. Added ball thickness to all of these for the edge cases (literally)
                // when there is a collision, but the vectors don't actually intersect at the box edge.
                p = this.checkIntersectionBall(
                    ball,
                    this.x - this.thickness - ball.thickness, this.y - this.thickness - ball.thickness,
                    this.x + this.thickness + ball.thickness, this.y - this.thickness - ball.thickness
                );

                if (p) {
                    // console.log("HIT - TOP");
                    ball.setSpeed(ball.dx, ball.dy * -1);
                }
            }
            else {
                p = this.checkIntersectionBall(
                    ball,
                    this.x - this.thickness - ball.thickness, this.y + this.thickness + ball.thickness,
                    this.x + this.thickness + ball.thickness, this.y + this.thickness + ball.thickness
                );

                if (p) {
                    // console.log("HIT - BOTTOM");
                    ball.setSpeed(ball.dx, ball.dy * -1);
                }
            }
            if (!p) {
                if (ball.prevX > this.x) {  // RIGHT
                    p = this.checkIntersectionBall(
                        ball,
                        this.x + this.thickness + ball.thickness, this.y - this.thickness - ball.thickness,
                        this.x + this.thickness + ball.thickness, this.y + this.thickness + ball.thickness
                    );

                    if (p) {
                        // console.log("HIT - RIGHT");
                        ball.setSpeed(ball.dx * -1, ball.dy);
                    }
                }
                else {
                    p = this.checkIntersectionBall(  // LEFT
                        ball,
                        this.x - this.thickness - ball.thickness, this.y - this.thickness - ball.thickness,
                        this.x - this.thickness - ball.thickness, this.y + this.thickness + ball.thickness
                    );

                    if (p) {
                        // console.log("HIT - LEFT");
                        ball.setSpeed(ball.dx * -1, ball.dy);
                    }
                }
            }

            if (p) {
                // console.log("ADJUSTED BALL");
                ball.move();
                return true;
            }

            return false;
        }
    }
}
// let allPlayers = [
//     new Player("NW", "green"),
//     new Player("NE", "blue"),
//     new Player("SE", "red"),
//     new Player("SW", "goldenrod"),
// ];
// currPlayer = allPlayers[2];

class Ball {
    radius = 0;
    thickness = 5;

    constructor(color) {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;

        this.prevX = this.x;
        this.prevY = this.y;

        this.setSpeed(2, 3);

        this.color = color;
    }

    setSpeed(dx, dy) {
        this.dx = dx;
        this.dy = dy;

        // Speed limits.
        if (this.dx > this.thickness) this.dx = this.thickness;
        if (this.dx < -this.thickness) this.dx = -this.thickness;

        if (this.dy > this.thickness) this.dy = this.thickness;
        if (this.dy < -this.thickness) this.dy = -this.thickness;
    }

    move() {
        this.prevX = this.x;
        this.prevY = this.y;

        this.x += this.dx;
        this.y += this.dy;

        this.checkCollisionBoundary();
    }

    // draw() {
    //     ctx.beginPath();
    //     ctx.fillStyle = this.color;
    //     ctx.arc(this.x, this.y, this.thickness, 0, 2 * Math.PI);
    //     ctx.fill();
    // }

    checkCollisionBoundary() {
        // If it hits the left or right wall.
        if ((this.x - this.thickness) <= 0 || (this.x + this.thickness) >= canvas.width) this.setSpeed(this.dx * -1, this.dy);

        // If it hits the top or bottom wall.
        if ((this.y - this.thickness) <= 0 || (this.y + this.thickness) >= canvas.height) this.setSpeed(this.dx, this.dy * -1);
    }
}
const ball = new Ball('white');
