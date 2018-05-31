const sleep = require('sleep-promise');
const { Wechaty, Room } = require('wechaty');
const inquirer = require('inquirer');
const Memobird = require('memobird');
const config = require('./config').default;
const moment = require('moment');
const uuidv1 = require('uuid/v1');
const LineByLineReader = require('line-by-line');
const _ = require('lodash');

const PRINT_SUCCESS_FLAG = 1;

const devices = [];
let counter = 0;

const entryPrompt = () => {
	const entries = [
		"Register new memobird device",
		"Run wechaty service",
		"Print text line by line",
		"Quit!"
	];
	inquirer.prompt([
		{
			type: 'list',
			name: 'entry',
			message: 'What do you want to do?',
			choices: entries
		}
	]).then(({ entry }) => {
		const idx = entries.indexOf(entry)
		switch (idx) {
			case 0:
				return addDevicesPrompt();
			case 1:
				return wechaty();
			case 2:
				return printBookPrompt();
			default:
				return;
		}
	});
}

const addDevicesPrompt = () => {
	inquirer.prompt([
		{
			type: 'input',
			name: 'deviceId',
			message: 'Please input the memobird device ID:',
		}
	]).then(({ deviceId }) => {
		// setup memobird here
		const memobird = new Memobird({
		  ak: config.memobird.accesskey,
		  memobirdID: deviceId,
			useridentifying: uuidv1(),
		});
		devices.push(memobird);
		entryPrompt();
	});
}

const printBookPrompt = () => {
	inquirer.prompt([
		{
			type: 'input',
			name: 'filename',
			message: 'Please enter the filename here:',
		},
		{
			type: 'input',
			name: 'loc',
			message: 'Please enter the beginning lines:',
			default: 0,
		}
	]).then(({ filename, loc }) => {
		printBook(filename, parseInt(loc, 10));
	});
}

entryPrompt();

const wechaty = () => {
	Wechaty.instance()
		.on('scan', (url, code) => {
			if (!/201|200/.test(String(code))) {
				const loginUrl = url.replace(/\/qrcode\//, '/l/')
				require('qrcode-terminal').generate(loginUrl)
			}
			console.log(url)
		})

		.on('login', user => {
			console.log(`${user} login`)
		})

		.on('message', async function (m) {
			const sender = m.from();
			const content = m.content().replace(/<(?:.|\n)*?>/gm, '');
			const date = new Date();
			const room = m.room();
			const type = m.type();

			if (parseInt(type, 10) !== 1) {
				// MsgType.TEXT (1)
				return;
			}

			if (room && config.wechaty.room && config.wechaty.regex.test(room.topic())) {
				// In the expected room
				console.log(`Room: ${room.topic()} Contact: ${sender.name()} Content: ${content}`)
				await sendToDevicesOrderly(wechatTemplate(sender.name(), date, content));
			} else if (!room && !config.wechaty.room && config.wechaty.regex.test(sender.name())) {
				// In the expected P2P conversation
				console.log(`Contact: ${sender.name()} Content: ${content}`)
				await sendToDevicesOrderly(wechatTemplate(sender.name(), date, content));
			}
		})
		.start()
}

const wechatTemplate = (sender, date, text) => {
	const time = moment(date);
	const timeStr = time.format('YYYY-MM-DD HH:mm:ss')
	return `${sender}  (${timeStr}):\n${text}`
}

const printBook = async function(filename, loc = 0) {
	const lr = new LineByLineReader(filename);

	const promise = new Promise(function(resolve, reject) {
		lr.on('error', function(err) {
			reject(err);
		});
		const readLines = [];
		let counter = -1;
		lr.on('line', async function(line) {
			counter += 1;
			if (counter < loc) {
				// Skip for LOC
				return;
			}
			if (!line.trim()) {
				return;
			}
			readLines.push(line.trim());
			// Print
			switch (config.global.preset) {
				case 'pipeline':
					if (readLines.length >= config.global.chunkReadLines) {
						lr.pause();
						const content = readLines.join('\n');
						console.log(`Printing ${counter}: ${content.substring(0, 20)}...`);
						await sendToDevicesOrderly(content);
						await sleep(config.global.waitSec);
						while (readLines.length) {
							readLines.pop();
						}
						lr.resume();
					}
					break;
				default:
					if (readLines.length >= config.global.chunkReadLines * devices.length) {
						lr.pause();
						console.log(`Printing chunk ${counter}, size: ${devices.length}`);
						await Promise.all(
							_.chunk(readLines, config.global.chunkReadLines)
								.map(chunk => chunk.join('\n'))
								.map(content => sendToDevicesOrderly(content))
						)
						await sleep(config.global.waitSec);
						while (readLines.length) {
							readLines.pop();
						}
						lr.resume();
					}
					break;
			}
		});
		lr.on('end', function() {
			resolve();
			entryPrompt();
		});
	});

	return await promise;
}

const sendToDevicesOrderly = async function(text) {
	// 多台咕咕机轮流打印
	if (devices.length <= 0) return;
	const selectedIdx = counter % devices.length;
	counter += 1;
	return await sendToDevice(devices[selectedIdx], text);
}

const sendToDevicesRandomly = async function(text) {
	// 多台咕咕机随机打印
	if (devices.length <= 0) return;
	const selectedDevice = devices[Math.floor(Math.random() * devices.length)];
	return await sendToDevice(selectedDevice, text);
}

const sendToDevice = async function(device, text) {
	try {
		await device.init();
		switch (config.global.api) {
			case 'best-effort':
				const ret = await device.printText(text);
				return !!ret;
			default:
				const contentId = await device.printText(text);
				const printflag = await device.watch(contentId, config.global.pollingSec, config.global.timeoutSec);
				return printflag === PRINT_SUCCESS_FLAG;
		}
	} catch (err) {
		console.error(err);
		// throw err;
	}
}
