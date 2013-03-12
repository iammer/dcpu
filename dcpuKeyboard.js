var DCPUKeyboard=new Class({
	keymap: {
		8: 0x10,
		13: 0x11,
		45: 0x12,
		46: 0x13,
		192: 0x7e,
		38: 0x80,
		40: 0x81,
		37: 0x82,
		39: 0x83,
		16: 0x90,
		17: 0x91
	},
	genKeypress: {
		0x10: true,
		0x12: true,
		0x13: true,
		0x80: true,
		0x81: true,
		0x82: true,
		0x83: true,
		0x90: true,
		0x91: true
	},
	init: function() {
		this.hwInit(0x7406,0x30cf,1,0,0);
		this.reset();
	},
	reset: function() {
		this.interruptsEnabled=0;
		this.keyBuffer=[];
		this.keysPressed={};
	},
	event: function(eventName, key) {
		if (eventName=='keydown') {
			key=this.keymap[key] || key;

			this.keysPressed[key]=true;
			
			logi('key: ' + key);
			
			if (this.genKeypress[key]) {
				this.keyBuffer.push(key);
			}
			
			this.sendInterrupt();
		} else if (eventName=='keyup') {
			key=this.keymap[key] || key;
			
			delete this.keysPressed[key];
			this.sendInterrupt();
		} else if (eventName=='keypress') {
			if (key >= 0x20 && key <= 0x7f) {
				this.keyBuffer.push(key);
			}
		}
	},
	sendInterrupt: function() {
		if (this.interruptsEnabled) {
			cpu.interrupt(this.interruptsEnabled);
		}
	},
	interrupt: function(cpu,state) {
		this.cpu=cpu;
		
		switch(cpu.gp[0]) {
		case 0:
			this.keyBuffer=[];
			break;
		case 1:
			if (this.keyBuffer.length==0) {
				cpu.gp[2]=0;
			} else {
				cpu.gp[2]=this.keyBuffer.shift();
			}
			break;
		case 2:
			cpu.gp[2]=keysPressed[cpu.gp[1]]?1:0;
			break;
		case 3:
			this.interruptsEnabled=cpu.gp[1];
			break;
		}
	}
		
},[DCPUHardware]);