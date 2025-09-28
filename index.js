import { createServer } from "http";
import express from "express";
import { Server } from "socket.io";
import fs from "fs";
import hash from "object-hash";

import { exec } from "child_process";

const app = express();
const server = createServer(app);
const io = new Server(server, {
	maxHttpBufferSize: 9e10
});

let mWsSavings = 0;
let queue = new BlockChain();

app.use(express.static("./src"));
app.post("/mws", function (_, res) {
	res.json({ mWsSavings });
});

io.on("connection", function (socket) {
	console.log("New Socket Connection: ", socket.id);
	socket.emit("queue", queue.arr().map(q => [q[0], q[3]]));

	socket.available = false;
	socket.working = false;
	socket.load = 0;

	socket.on("available", function (availability, gpuLoad){
		socket.available = availability;
		socket.load = gpuLoad;
	});

	socket.on("queue", async function (file, mW, isAI) {
		console.log("is AI: ", isAI);
		queue.push([socket.id, file, mW, isAI]);
		propogateQueue();
	});

	socket.on("completed", async function(file, mW, t, cb){
		console.log("completed", queue.first()[3]);

		socket.working = false;

		mWsSavings += t * (mW - queue.first()[2]);
		cb(t * (mW - queue.first()[2]));
		console.log("Savings", mWsSavings);

		if ((await workingSockets()).length) return;
		if(!queue.first()[3]) io.to(queue.first()[0]).emit("result", file, "result.tar.gz", t * (mW - queue.first()[2]));
		else{
			io.to(queue.first()[0]).emit("result", file, "model.pth", t * (mW - queue.first()[2]));
		}

		queue.shift();
		io.emit("queue", queue.arr().map(q => [q[0], q[3]]));
	});
});

server.listen(3000);

async function propogateQueue(){
	io.emit("queue", queue.arr().map(q => [q[0], q[3]]));

	let available = (await availableSockets()).sort((a,b) => a.load - b.load);
	let loadSum = available.reduce((a, b) => a.load + b.load, 0);

	console.log(queue.first());

	if(queue.first()[3]){
		for (let i = 0; i < available.length; i++){
			available[i].working = true;
			available[i].emit("AI execute", queue.first()[1], i, available.length, available[i].load/loadSum);
		}
		return
	}

	for(let socket of available){
		if (socket.id == queue.first()[0]) continue;
		socket.working = true;
		socket.emit("execute", queue.first());
	}
}

async function workingSockets(){
	let sockets = await io.fetchSockets();
	return sockets.filter(s => s.working);
}

async function availableSockets(){
	let sockets = await io.fetchSockets();
	return sockets.filter(s => s.available);
}

class BlockChain {
	constructor() {
		this.chain = [];
	}
	push(data){
		var block = {
			data,
			previousHash: this.chain[this.chain.length - 1]?.hash
	 	};
		block.hash = hash(block);
		this.chain.push(block);
	}
	shift() {
		this.chain.shift();
	}
	get(n){
		return this.chain[n]?.data;
	}
	first(){
		return this.chain[0]?.data;
	}
	arr(){
		return this.chain.map(c => c.data);
	}
}
