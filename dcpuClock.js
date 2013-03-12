var DCPUClock=new Class({
	init: function() {
		this.hwInit(0xb402,0x12d0,1,0,0);
		this.reset();
	},
	reset: function() {
		this.tickRate=0;
		this.masterTicks=0;
		this.tickCount=0;
		this.interruptsEnabled=0;
	},
	interrupt: function(cpu) {
		this.cpu=cpu;
		
		//logi('clock interrupt');
		
		switch(cpu.gp[0]) {
		case 0:
			if (this.tickRate==0 && cpu.gp[1] !=0) {
				if (cpu.gp[1]!=0) {
					cpu.clocksRunning++;
					//logi(cpu.clocksRunning);
					if (cpu.clocksRunning==1) {
						cpu.nextTickCycle=cpu.cycleCount;
					}
					//logi(cpu.nextTick);
				}
			} else {
				if (cpu.gp[1]==0) cpu.clocksRunning--;
			}
		
			this.tickRate=cpu.gp[1];
			this.tickCount=0;
			this.masterTicks=0;
						
			break;
		case 1:
			cpu.gp[2]=this.tickCount;
			break;
		case 2:
			this.interruptsEnabled=cpu.gp[1];
			break;
		}
	},
	masterTick: function() {
		if (this.tickRate) {
			this.masterTicks++;
			if (this.masterTicks % this.tickRate==0) {
				//log('ticking: ' + this.interruptsEnabled);
				this.tickCount++;
				if (this.interruptsEnabled) this.cpu.interrupt(this.interruptsEnabled);
			}
		}
	}
},[DCPUHardware]);