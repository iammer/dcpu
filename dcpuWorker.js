importScripts("utils.js");
importScripts("dcpuHardware.js");
importScripts("dcpuKeyboard.js");
importScripts("dcpuClock.js");

var MIN_CYCLE_INTERVAL=30;

var logHolder=[];

self.onmessage= function(e) {
	var msg=e.data;

	//log("message echo: " + msg.type);
	
	if (msg=="msgClear") {
		if (dcpu.running) dcpu.runThrottled();
	} else {
		if (messageHandler[msg.type]) {
			messageHandler[msg.type](msg);
		}
	}
	
};

var messageHandler={
	init: function(msg) {
		dcpu.init(msg.config);
		send('ready', {}, msg.id);
	},
	start: function(msg) {
		dcpu.run();
	},
	pause: function(msg) {
		//log('got pause');
		dcpu.running=false;
		dcpu.lastPauseReq=msg.id;
	},
	getmem: function (msg) {
		//log("Sending mem: " + msg.start + ", " + msg.end);
		send('mem', {mem: dcpu.mem.subarray(msg.start,msg.end)},msg.id);
	},
	debug: function (msg) {
		dcpu.debugMode=msg.state;
	},
	'break': function (msg) {
		if (msg.action=='set') {
			if (msg.breakOn=='reg') {
				if (msg.reg!='gp') {
					//logi('creating breakpoint: ' + msg.id);
					dcpu.breakpoints[msg.id]=function(cpu) {
						return (cpu[msg.reg]==msg.val);
					}
				} else {
					dcpu.breakpoints[msg.id]=function(cpu) {
						return (cpu[msg.reg][msg.idx]==msg.val);
					}
				}
			}
		} else if (msg.action='rm') {
			delete dcpu.breakpoints[msg.id];
		}
	},
	memforstate: function (msg) {
		dcpu.memForState={addr: msg.addr, update: true};
		send('state', dcpu.getSimpleState());
	},
	state: function (msg) {
		send('state', dcpu.getSimpleState(), msg.id);
	},
	setreg: function (msg) {
		if (msg.reg=='gp') {
			dcpu.gp[msg.idx]=msg.value;
		} else if (msg.reg=='pc') {
			dcpu.pc=msg.value;
		} else if (msg.reg=='sp') {
			dcpu.sp=msg.value;
		} else if (msg.reg=='o' || msg.reg=='ex') {
			dcpu.o=msg.value;
		}
	},
	getreg: function (msg) {
		if (msg.reg=='gp') {
			send('getreg',{value: dcpu.gp[msg.idx]},msg.id);
		} else if (msg.reg=='pc') {
			send('getreg',{value: dcpu.pc},msg.id);
		} else if (msg.reg=='sp') {
			send('getreg',{value: dcpu.sp},msg.id);
		} else if (msg.reg=='o' || msg.reg=='ex') {
			send('getreg',{value: dcpu.o},msg.id);
		}
	},
	setmem: function (msg) {
		var words=msg.words;
		for(var i=0;i<words.length;i++) {
			dcpu.checkMemWatch(msg.offset+i,words[i]);
			dcpu.mem[msg.offset+i]=words[i];
		}
	},
	step: function (msg) {
		dcpu.isHalted=false;
		dcpu.stepping=true;
		dcpu.running=true;
		dcpu.cycle();
		dcpu.running=false;
		send('step',{state: dcpu.getSimpleState()},msg.id);
	},
	dump: function (msg) {
		//log("sendingOutput");
		send('dump', {text: dcpu.dumpRegs() + "\n\n" + dcpu.dumpMem(0x0,0x40)},msg.id);
	},
	memwatch: function (msg) {
		if (msg.action=='set') {
			//log('setting mw: ' + msg.id + ' ' + msg.region);
			dcpu.memWatch[msg.id]=msg.region;
		} else if (msg.action=='rm') {
			delete dcpu.memWatch[msg.id];
		}
	},
	reset: function(msg) {
		dcpu.reset();
		send('reset',{},msg.id);
	},
	watchmode: function (msg) {
		dcpu.watchMode=msg.enabled;
	},
	interrupt: function (msg) {
		dcpu.queueInterrupt(msg.a);
	},
	hardware: function (msg) {
		dcpu.setHardware(msg.list);
	},
	intret: function(msg) {
		dcpu.interruptReturn();
	},
	keyevent: function(msg) {
		dcpu.keyevent(msg.idx,msg.name,msg.key);
	}
};

function send(t,m,id) {
	if (!m) m={};
	m.type=t;
	if (id) m.id=id;
	
	self.postMessage(m);
}

function logi(msg) {
	send('log',{msg: msg, order: new Date().getTime()});
}

function log(msg) {
	logHolder.push({msg: msg, order: new Date().getTime()});
}

function flushLog() {
	//log("flushLog called");
	send('flushLog', {messages: logHolder});
	logHolder=[];
}

var dcpu={
	init: function(config) {
		this.isHalted=false;
		this.breakpoints={};
		this.debugMode=true;
		this.cycleCount=0;
		this.runThrottledBound=bind(this,this.runThrottled);
		this.khz=100;
		this.tickHz=60;
		this.clocksPerTick=(this.khz/this.tickHz)*1000;
		this.running=false;
		this.runTime=0;
		this.watchMode=false;
		this.memForState={addr: 0, update: true};
		this.waitingHwi=false;
		this.clocksRunning=0;
		
		this.internalHardware=[];
		this.clocks=[];
		this.keyboards=[];
		for(var i=0;i<config.numKeyboards;i++) {
			var kb=new DCPUKeyboard();
			this.keyboards.push(kb);
			this.internalHardware.push(kb);
		}
		
		for(var i=0;i<config.numClocks;i++) {
			var cl=new DCPUClock();
			this.clocks.push(cl);
			this.internalHardware.push(cl);
		}
		
		this.externalHardware=[];
		
		this.reset();
		
		logi("init complete");
	},
	reset: function() {
		this.mem=new Uint16Array(0x10000);
		this.gp=new Uint16Array(8);
		this.pc=0;
		this.sp=0;
		this.o=0;
		this.ia=0;
		this.triggerInterrupts=1;
		this.interruptQueue=[];
		this.nextKey=0;
		this.clocksRunning=0;
		
		this.memWatch={};
		
		this.internalHardware.each(function(ih) {
			ih.reset();
		});
	},
	run: function() {
		this.lastRun=new Date().getTime();
		this.isHalted=false;
		this.running=true;
		this.stepping=false;
		this.runThrottled();
	},
	interruptReturn: function() {
		this.running=!this.stepping;
		this.waitingHwi=false;
		if (this.running) this.runThrottled();
	},
	runThrottled: function() {
		//log("runThrottled Called");
		var now=new Date().getTime();
		var diff=now-this.lastRun;
		this.lastRun=now;
		//logi("last Ran: " + diff + "ms ago");
		
		this.runTime+=diff;
		
		var expectedCycles=this.cycleCount+(diff*this.khz);
		this.cycle(expectedCycles);
		
		if (this.running) {
			setTimeout(this.runThrottledBound,MIN_CYCLE_INTERVAL);
			if (this.debugMode) send('state',this.getSimpleState());
		} else {
			//log("Stopped for now");
			this.runTime+=(new Date().getTime()-now);
			if (!this.waitingHwi) send(this.isHalted?'halt':'pause',{state: this.getSimpleState()},this.lastPauseReq);
			flushLog();
		}
	},
	queueInterrupt: function(a) {
		this.interruptQueue.unshift(a);
	},
	interrupt: function(a) {
		if (this.ia != 0) {
			//log('interrupting');
			//this.running=false;
			this.triggerInterrupts=false;
			this.cycleCount+=4;
			this.incSP(-1);
			this.mem[this.sp]=this.pc;
			this.incSP(-1);
			this.mem[this.sp]=this.gp[0];
			//log('sp: ' + this.sp + ' pc: ' + this.pc + 
			this.pc=this.ia;
			this.gp[0]=a;
			if (this.debugMode) {
				this.checkBreakpoints();
			}
		}
	},
	setHardware: function(hw) {
		this.externalHardware=hw;
		//log("setting hardware: " +  hw[0].join(","));
	},
	cycle: function(count) {
		if (!count) count=this.cycleCount+1;
		
		//log("Cycling till: " + count);
		while((count==-1 || this.cycleCount<count) && this.running) {
			
			if (this.clocksRunning>0) {
				if (this.cycleCount>this.nextTickCycle) {
					//logi('Master tick');
					this.nextTickCycle+=this.clocksPerTick;
					for(var i=0;i<this.clocks.length;i++) {
						this.clocks[i].masterTick();
					}
				}
			}
			
			if (this.triggerInterrupts && this.interruptQueue.length>0) {
				this.interrupt(this.interruptQueue.pop());
			}
			
			if (!this.running) break;
			
			this.cycleCount++;
			this.lastpc=this.pc;
			
			var op=this.mem[this.pc];
			var i= op & 0x1F;
			var a=this.getOpp((op >>> 10) & 0x3F);
			//log("i is " + i);
			switch(i) {
			case 0:
				var i=(op>>5) & 0x1f;
				//log("i is " + i);
				
				switch(i) {
				case 1:
					this.cycleCount++;
					this.incSP(-1);
					this.mem[this.sp]=this.lastpc+this.getInstrSize(op);
					this.pc=a.get()-1;
					//log("Set pc: " + this.pc);
					break;
				case 2:
					this.pc--;
					this.isHalted=true;
					this.running=false;
					break;
				case 0x8:
					this.interruptQueue.push(a.get());
					break;
				case 0x9:
					a.set(this.ia);
					break;
				case 0x0a:
					this.ia=a.get();
					break;
				case 0x0b:
					this.cycleCount+=2;
					this.triggerInterrupts=true;
					this.gp[0]=this.mem[this.sp];
					this.incSP(1);
					this.pc=this.mem[this.sp]-1;
					this.incSP(1);
					break;
				case 0x0c:
					this.cycleCount++;
					this.triggerInterrupts=(a.get()!=0);
					break;
				case 0x10:
					this.cycleCount++;
					a.set(this.internalHardware.length+this.externalHardware.length);
					break;
				case 0x11:
					this.cycleCount+=3;
					var av=a.get();
					var hw;
					if (av<this.internalHardware.length) {
						hw=this.internalHardware[av].descriptor;
					} else {
						hw=this.externalHardware[av-this.internalHardware.length];
					}
					
					for(var i=0;i<5;i++) {
						this.gp[i]=hw?hw[i]:0;
					}
					break;
				case 0x12:
					this.cycleCount+=3;
					var av=a.get();
					
					if (av<this.internalHardware.length) {
						this.internalHardware[av].interrupt(this);
					} else {
						send('hwi',{state: this.getSimpleState(false, true, true, true)},'hwi' + (av-this.internalHardware.length));
						this.running=false;
						this.waitingHwi=true;
					}
					break;
				}
				break;
			case 0x1e:
				var b=this.getOpp((op >>> 5) & 0x1F);
				b.set(a.get());
				this.cycleCount++;
				this.gp[6]++;
				this.gp[7]++;
				this.gp[6]&=0xffff;
				this.gp[7]&=0xffff;
				break;
			case 0x1f:
				var b=this.getOpp((op >>> 5) & 0x1F);
				b.set(a.get());
				this.cycleCount++;
				this.gp[6]--;
				this.gp[7]--;
				this.gp[6]&=0xffff;
				this.gp[7]&=0xffff;
				break;
			case 1:
				var b=this.getOpp((op >>> 5) & 0x1F);
				b.set(a.get());
				break;			
			default:
				var b=this.getOpp((op >>> 5) & 0x1F);
				
				var av=a.get();
				var bv=b.get();
				
				if ((i & 0xd)==5) {
					//log('before av: ' + av + ', bv:' + bv);
					av=this.getSigned(av);
					bv=this.getSigned(bv);
					//log('after av: ' + av + ', bv:' + bv);
				}
			
				switch(i) {
				case 2:
					this.cycleCount++;
					var r=av+bv;
					b.set(r);
					this.o=(r >>> 16);
					break;
				case 3:
					this.cycleCount++;
					var r=bv-av;
					b.set(r);
					this.o=(r >> 16) & 0xFFFF;
					break;
				case 4:
				case 5:
					this.cycleCount++;
	
					var r=av*bv;
					b.set(r);
					this.o=(r >>> 16) & 0xFFFF;
					break;
				case 6:
				case 7:
					this.cycleCount+=2;
					
					if (av==0) {
						b.set(0);
						this.o=0;
					} else {
						var r=(bv/av) >> 0;
						b.set(r);
						this.o=((((bv<<16)/av)) >> 0) & 0xFFFF;
					}
					break;
				case 8:
					this.cycleCount+=2;
					
					if (av==0) {
						b.set(0);
						this.o=0;
					} else {
						b.set(bv % av);
					}
					break;
				case 9:
					//log(av + "," + bv + "," + (av & bv));
					b.set(av & bv);
					break;
				case 0xa:
					b.set(av | bv);
					break;
				case 0xb:
					b.set(av ^ bv);
					break;
				case 0xc:
					this.cycleCount++;
					
					this.o=((bv << 16) >> av) & 0xffff;
					b.set(bv >>> av);
					break;
				case 0xd:
					this.cycleCount++;
					this.o=((bv << 16) >>> av) & 0xffff;
					a.set(bv >> av);
					break;
				case 0xe:
					this.cycleCount++;
					var r=bv << av;
					b.set(r);
					this.o=(r>>>16) & 0xffff;
					break;
				case 0x10:
				case 0x11:
					this.cycleCount++;
					if (((bv & av)==0) ^ (i & 1)) {
						this.doIfFail();
					}
					break;
				case 0x12:
				case 0x13:
					this.cycleCount++;
					if ((av!=bv) ^ (i & 1)) {
						this.doIfFail();
					}
					break;
				case 0x14:
				case 0x15:
					this.cycleCount++;
					//logi("av: " + av + ", " + "bv: " + bv);
					if (av >= bv) {
						this.doIfFail();
					}
					break;
				case 0x16:
				case 0x17:
					this.cycleCount++;
					if (av <= bv) {
						this.doIfFail();
					}
					break;
				case 0x1a:
					this.cycleCount+=2;
					var r=av+bv+this.o;
					b.set(r & 0xffff);
					this.o=r>0xffff?1:0;
					break;
				case 0x1b:
					this.cycleCount+=2;
					var r=bv-av+this.o;
					b.set(r & 0xffff);
					this.o=r<0?0xffff:0;
					break;
				}
			}
			this.incPC(1);
			
			if (this.debugMode) {
				this.checkBreakpoints();
			}
		}
	},
	checkBreakpoints: function() {
		for (var id in this.breakpoints) {
			var bp=this.breakpoints[id];
			if (bp(this)) {
				this.running=false;
				send('breakpoint', {state: this.getSimpleState()},id);
			}
		}
	},
	incPC: function(v) {
		this.pc=(this.pc+v) & 0xFFFF;
	},
	incSP: function(v) {
		this.sp=(this.sp+v) & 0xFFFF;
	},
	doIfFail: function() {
		//log("failing if");
		this.cycleCount++;
		while((this.mem[this.pc+1] & 0x18) == 0x10 ) {
			this.cycleCount++;
			this.incPC(this.getInstrSize(this.mem[this.pc+1]));
			//log("pc = " + this.pc);
		}
		this.incPC(this.getInstrSize(this.mem[this.pc+1]));
	},
	getInstrSize: function(o) {
		var s=1;
		var a=0;
		if ((o & 0x1f) != 0) {
			a=((o >>> 5) & 0x1f);
		}
		
		var b=((o >>> 10) & 0x3f);
		
		if ( (a >>> 3) == 2 || (a >>> 1) == 0xf  || a==0x1a) s++;
		if ( (b >>> 3) == 2 || (b >>> 1) == 0xf || b==0x1a) s++;
		
		return s;
	},
	getOpp: function(v) {
		//log("Getting op for: " + v);
		var cpu=this;
		switch(v >>> 3) {
		case 0:
			return {
				set: function(x) {
					x&=0xFFFF;
					cpu.gp[v]=x;
				},
				get: function() {
					return cpu.gp[v];
				}
			};
		case 1:
			return this.getMemOpp(this.gp[v & 0x7]);
		case 2:
			this.cycleCount++;
			this.incPC(1);
			return this.getMemOpp(this.gp[v &0x7]+this.mem[this.pc]);
		case 3:
		switch(v & 0x7) {
			case 0:
				return {
					set: function(x) {
						cpu.incSP(-1);
						x&=0xFFFF;
						cpu.checkMemWatch(cpu.sp,x);
						cpu.mem[cpu.sp]=x;
					},
					get: function() {
						var ret=cpu.mem[cpu.sp];
						cpu.incSP(1);
						return ret;
					}
				}						
			case 1:
				return this.getMemOpp(this.sp);
			case 2:
				this.incPC(1);
				return this.getMemOpp(this.sp+this.mem[this.pc]);
			case 3:
				return {
					set: function(x) {
						x&=0xffff;
						cpu.sp=x;
					},
					get: function() {
						return cpu.sp;
					}
				};
			case 4:
				return {
					set: function(x) {
						x&=0xffff;
						cpu.pc=x-1;
					},
					get: function() {
						return cpu.lastpc;
					}
				};
			case 5:
				return {
					set: function(x) {
						x&=0xffff;
						cpu.o=x;
					},
					get: function() {
						return cpu.o;
					}
				};
			case 6:
				this.cycleCount++;
				this.incPC(1);
				return this.getMemOpp(this.mem[this.pc]);
			case 7:
				this.cycleCount++;
				this.incPC(1);
				return this.getMemOpp(this.pc);
			}
		default:
			return {
				set: function(x) {},
				get: function() { return ((v & 0x1f) -1) & 0xffff;}
			};
		}
			
	},
	getMemOpp: function(m) {
		var cpu=this;
		return {
			set: function(x) {
				//log("setting mem: " + m + " " + x);
				x&=0xFFFF;
				cpu.checkMemWatch(m,x);
				cpu.mem[m]=x;
			},
			get: function() {
				return cpu.mem[m];
			}
		};
	},
	checkMemWatch: function(addr,value) {
		//log('checking for mw for: ' + addr + ': ' + value);
		for(var id in this.memWatch) {
			var mw=this.memWatch[id];
			//log('checking mw: ' + id + ' ' + mw);
			if (mw.start <= addr && addr < mw.end) {
				//log('sending m val');
				send('m', {addr: addr, value: value},id);
			}
		}
	},
	loadMem: function(offset,bytes) {
		for(var i=0;i<bytes.length;i++) {
			this.mem[offset+i]=bytes[i] & 0xffff;
		}
	},
	dumpMem: function(start,stop) {
		var out="";
	
		for(var i=start;i<stop;i+=8) {
			out+=zeroPad(i.toString(16),4) + ": ";
			for (var j=0;j<8;j++) {
				out+=zeroPad(this.mem[i+j].toString(16),4) + " ";
			}
			out+="\n";
		}
		
		return out;
	},
	dumpRegs: function() {
		return "A: " + zeroPad(this.gp[0].toString(16),4) +
			" B: " + zeroPad(this.gp[1].toString(16),4) +
			" C: " + zeroPad(this.gp[2].toString(16),4) +
			"\nX: " + zeroPad(this.gp[3].toString(16),4) +
			" Y: " + zeroPad(this.gp[4].toString(16),4) +
			" Z: " + zeroPad(this.gp[5].toString(16),4) +
			"\nI: " + zeroPad(this.gp[6].toString(16),4) +
			" J: " + zeroPad(this.gp[7].toString(16),4) +
			" O: " + zeroPad(this.o.toString(16),4) +
			"\nPC: " + zeroPad(this.pc.toString(16),4) +
			" SP: " + zeroPad(this.sp.toString(16),4) +
			"\nkHz: " + (this.runTime==0?0:this.cycleCount/this.runTime);
			
	},
	getSimpleState: function(noregs, nostack, normem, nomem) {
		var ret={
			cycleCount: this.cycleCount,
			runTime: this.runTime
		};
		
		if (!noregs) {
			ret.regs={
				gp: [],
				o: this.getRegState(this.o),
				sp: this.getRegState(this.sp),
				pc: this.getRegState(this.pc),
				ia: this.getRegState(this.ia)
			};
			
			for(var i=0;i<8;i++) {
				ret.regs.gp[i]=this.getRegState(this.gp[i]);
			}
		}
		
		if (!nostack) {
			var stack=[];
			
			var i=0;
			if (this.sp!=0) {
				while(i+this.sp<0x10000 && i<16) {
					stack.push(this.mem[this.sp+i]);
					i++;
				}
			}
			
			while (i<16) {
				stack.push('');
				i++;
			}
			
			ret.stack=stack;
		}
			
		if (!nomem) {
			ret.mem={words: this.mem.subarray(this.memForState.addr,this.memForState.addr+0x40)};
			
			if (this.memForState.update) {
				this.memForState.update=false;
				ret.mem.addr=[];
				for(var i=0;i<4;i++) {
					ret.mem.addr[i]=this.memForState.addr+i*0x10;
				}
			}
		}
		
		return ret;
	},
	getRegState: function(regVal) {
		return { val: regVal, mem: this.mem[regVal] };
	},
	getSigned: function(x) {
		//log("x: " + x + ", x & 0x8000: " + (x & 0x8000));
		if ((x & 0x8000)==0) {
			//log('returning: ' + x);
			return x;
		} else {
			return (~x) - 1;
		}
	},
	keyevent: function(idx, name, key) {
		this.keyboards[idx].event(name,key);
	}
}

