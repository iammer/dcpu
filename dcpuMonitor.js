var DCPUMonitor=new Class ({
	refreshRate: 60,
	init: function(canvas) {
		this.scale=4;
		this.blinkState=0;
		this.tileWidth=4;
		this.tileHeight=8;
		this.tileWidthPixels=this.tileWidth*this.scale;
		this.tileHeightPixels=this.tileHeight*this.scale;
		this.columns=32;
		this.rows=12;
		this.width=this.columns*this.tileWidth;
		this.height=this.rows*this.tileHeight;
		this.borderSize=4;
		this.borderPixels=this.borderSize*this.scale;
		
		this.pixelHeight=(this.height+2*this.borderSize)*this.scale;
		this.pixelWidth=(this.width+2*this.borderSize)*this.scale;
		
		canvas.height=this.pixelHeight
		canvas.width=this.pixelWidth;
		
		this.canvas=canvas;
		this.context=canvas.getContext('2d');
		
		canvas.tabindex=1;
		
		this.refreshTime=1000/this.refreshRate;
		this.refresh=bind(this,this.refreshUB);
				
		this.blinkRate=0x20;
		
		this.reset();
		
		this.hwInit(0xf615,0x7349,0x1802,0x8b36,0x1c6c);	
	},
	reset: function() {
		this.imageData=this.context.createImageData(this.pixelWidth,this.pixelHeight);
		this.dirtyTiles=new Uint8Array(this.rows*this.columns);
		this.blinkingTiles=new Uint8Array(this.rows*this.columns);

		this.context.fillStyle="#888888";
		this.context.fillRect(0,0,this.pixelWidth,this.pixelHeight);
		
		this.refreshes=0;
		this.videoMem=undefined;
		this.palette=this.defaultPalette;
		this.fontMem=this.defaultFont;
		this.borderColor=0;
		
		this.videoMemAt=0;
		this.fontMemAt=0;
		this.paletteMemAt=0;
		
		this.videoMemWatch=undefined;
		this.fontMemWatch=undefined;
		this.palletMemWatch=undefined;
	},
	interrupt: function(cpu,state) {
		this.cpu=cpu;
		
		switch(state.regs.gp[0].val) {
		case 0:
			this.videoMemAt=state.regs.gp[1].val;
			
			if (this.videoMemWatch) {
				cpu.rmMemWatch(this.videoMemWatch);
			}
			
			if (this.videoMemAt!=0) {
				this.videoMem=cpu.getMem(this.videoMemAt,this.videoMemAt+0x180,bind(this,function(msg) {
					this.videoMem=msg.mem;
					this.dirtyAll=true;
				}));
				
				this.videoMemWatch=cpu.setMemWatch(this.videoMemAt,this.videoMemAt+0x180,bind(this,function(msg) {
					if (!this.dirtyAll) {
						if (this.dirtyTiles!=(msg.value & 0x7f)) {
							this.dirtyTiles[msg.addr-this.videoMemAt]=(msg.value & 0x7f) | 0x80;
						}
					}
				
					this.videoMem[msg.addr-this.videoMemAt]=msg.value;
				}));
				
			}
			break;
		case 1:
			this.fontMemAt=state.regs.gp[1].val;
			
			if (this.fontMemWatch) {
				cpu.rmMemWatch(this.fontMemWatch);
			}
			
			if (this.fontMemAt!=0) {
				this.fontMem=cpu.getMem(this.fontMemAt,this.fontMemAt+0x100,bind(this,function(msg) {
					this.fontMem=msg.mem;
					this.dirtyAll=true;
				}));
				
				this.fontMemWatch=cpu.setMemWatch(this.fontMemAt,this.fontMemAt+0x100,bind(this,function(msg) {
					if (this.fontMemAt!=0) {
						this.dirtyAll=true;
						this.fontMem[msg.addr-this.fontMemAt]=msg.value;
					}
				}));
			} else {
				this.fontMem=this.defaultFont;
			}
				
			break;
		case 2:
			this.paletteMemAt=state.regs.gp[1].val;
			
			if (this.paletteMemWatch) {
				cpu.rmMemWatch(this.paletteMemWatch);
			}
			
			if (this.paletteMemAt!=0) {
				var paletteMem=cpu.getMem(this.paletteMemAt,this.paletteMemAt+0x10,bind(this,function(msg) {
					this.paletteMem=msg.mem;
					this.dirtyAll=true;
					
					for(var i=0;i<paletteMem.length;i++) {
						var val=paletteMem[i];
						var r=(val >> 8) & 0xf;
						var g=(val >> 4) & 0xf;
						var b=val & 0xf;
						
						this.palette[idx]=[(r << 4) | r,(g << 4) | g, (b << 4) | b];
					}
				}));
				
				this.paletteMemWatch=cpu.setMemWatch(this.paletteMemAt,this.paletteMemAt+0x10,bind(this,function(msg) {
					if (this.paletteMemAt!=0) {
						this.dirtyAll=true;
						var idx=msg.addr-this.paletteMemAt;
						var val=msg.value;
						var r=(val >> 8) & 0xf;
						var g=(val >> 4) & 0xf;
						var b=val & 0xf;
					
						this.palette[idx]=[(r << 4) | r,(g << 4) | g, (b << 4) | b];
					}
				}));
			} else {
				this.palette=this.defaultPalette;
			}
			break;
		case 3:
			this.borderColor=state.regs.gp[1].val & 0xf;
			this.borderDirty=true;
			break;
		}
		
		cpu.interruptReturn();
	},
	start: function() {
		this.startTime=new Date().getTime();
		this.interval=setInterval(this.refresh,this.refreshTime);			
	},
	stop: function() {
		if (typeof this.interval!='undefined') clearInterval(this.interval);
		this.interval=undefined;
	},
	focus: function() {
		this.canvas.focus();
	},
	refreshUB: function() {
		this.refreshes++;
		this.lastRefresh=new Date().getTime();
		
		if (this.videoMemAt) {
			if (this.refreshes % this.blinkRate == 0) {
				this.blinkState=!this.blinkState;
				
				for(var i=0;i<this.blinkingTiles.length;i++) {
					if (this.blinkingTiles[i]) {
						this.dirtyTiles[i]|=0x80;
					}
				}
			}
			
			for(var i=0;i<this.rows;i++) {
				for (var j=0;j<this.columns;j++) {
					var tileIdx=(i*this.columns)+j
					if (this.dirtyAll || (this.dirtyTiles[tileIdx] & 0x7f)) {
						var word=this.videoMem[tileIdx];
						var tile=word & 0x7f;
						var blink=(word >> 7 ) & 1;
						var bgColor=(word >> 8) & 0xf;
						var fgColor=(word >> 12) & 0xf;
						if (blink & this.blinkState) fgColor=bgColor;
						
						this.blinkingTiles[tileIdx]=blink;
						this.drawTile(j,i,tile,this.palette[fgColor],this.palette[bgColor]);
						
						this.dirtyTiles[tileIdx]=tile;
						
						if (!this.dirtyAll) {
							this.context.putImageData(this.imageData,0,0,
								j*this.tileWidthPixels+this.borderPixels,
								i*this.tileHeightPixels+this.borderPixels,
								this.tileWidthPixels,
								this.tileHeightPixels);
						}
					}
					
					
				}
			}
			
			if (this.dirtyAll || this.dirtyBorder) {
				this.drawBorder(this.palette[this.borderColor]);
				
				if (!this.dirtyAll) {
					this.context.putImageData(this.imageData,0,0,0,0,this.pixelWidth,this.borderPixels);
					this.context.putImageData(this.imageData,0,0,0,this.pixelHeight-this.borderPixels,this.pixelWidth,this.borderPixels);
					this.context.putImageData(this.imageData,0,0,0,this.borderPixels,this.borderPixels,this.pixelHeight-this.borderPixels);
					this.context.putImageData(this.imageData,0,0,this.pixelWidth-this.borderPixels,this.borderPixels,this.borderPixels,this.pixelHeight-this.borderPixels);
				}
				
				this.dirtyBorder=false;
			}
				
			if (this.dirtyAll) {
				this.context.putImageData(this.imageData,0,0);
			}
			
			this.dirtyAll=false;
		}
		/*var end=new Date().getTime();
		
		if (end-this.lastRefresh > 30) {
			console.log('monitor refresh time: ' + (end-this.lastRefresh()));
		}
		
		if (this.refreshes % (5*this.refreshRate) ==0) {
			console.log('monitor hz: ' + this.refreshes*1000/(end- this.startTime));
		}*/
		
	},
	drawTile: function(x,y,t,f,b) {
		//console.log("Drawing " + x + ", " + y);
		
		for(var i=0;i<2;i++) {  // i <- word of tile
			var w=this.fontMem[t*2+i];
			for (var j=1;j>=0;j--) { // j <- byte of word
				for (var k=7;k>=0;k--) { //k <- bit of byte
					var s=w & 1;
					w=(w >> 1);
					
					var xc=(x*this.tileWidth+i*2+j) * this.scale;
					var yc=(y*this.tileHeight+k) * this.scale;
					
					for(var m=0;m<this.scale;m++) {
						for(var n=0;n<this.scale;n++) {
							var startByte=((yc+m+this.borderPixels)*this.imageData.width+xc+n+this.borderPixels)*4;
							var c=s?f:b;
							this.imageData.data[startByte]=c[0];
							this.imageData.data[startByte+1]=c[1];
							this.imageData.data[startByte+2]=c[2];
							this.imageData.data[startByte+3]=255;
						}
					}
				}
			}
		}
	},
	drawBorder: function(c) {
		var bottomBorder=(this.pixelHeight-this.borderPixels)*this.pixelWidth*4;
		for(var i=0;i<(this.borderPixels*this.pixelWidth)*4;i+=4) {
			this.imageData.data[i]=c[0];
			this.imageData.data[i+1]=c[1];
			this.imageData.data[i+2]=c[2];
			this.imageData.data[i+3]=255;
			
			this.imageData.data[bottomBorder+i]=c[0];
			this.imageData.data[bottomBorder+i+1]=c[1];
			this.imageData.data[bottomBorder+i+2]=c[2];
			this.imageData.data[bottomBorder+i+3]=255;
		}
		
		var rightOffset=(this.pixelWidth-this.borderPixels)*4;
		for(var i=0;i<this.borderPixels;i++) {
			for(var j=0;j<(this.height*this.scale);j++) {
				var startByte=((this.borderPixels+j)*this.pixelWidth+i)*4;
				
				this.imageData.data[startByte]=c[0];
				this.imageData.data[startByte+1]=c[1];
				this.imageData.data[startByte+2]=c[2];
				this.imageData.data[startByte+3]=255;
				
				this.imageData.data[startByte+rightOffset]=c[0];
				this.imageData.data[startByte+rightOffset+1]=c[1];
				this.imageData.data[startByte+rightOffset+2]=c[2];
				this.imageData.data[startByte+rightOffset+3]=255;
			}
		}
	},
	defaultPalette: [
		[0x00,0x00,0x00],
		[0x00,0x00,0xaa],
		[0x00,0xaa,0x00],
		[0x00,0xaa,0xaa],
		[0xaa,0x00,0x00],
		[0xaa,0x00,0xaa],
		[0xaa,0xaa,0x55],
		[0xaa,0xaa,0xaa],
		[0x55,0x55,0x55],
		[0x55,0x55,0xff],
		[0x55,0xff,0x55],
		[0x55,0xff,0xff],
		[0xff,0x55,0x55],
		[0xff,0x55,0xff],
		[0xff,0xff,0x55],
		[0xff,0xff,0xff]
	],
	defaultFont: [240, 4112, 4336, 4112, 4127, 4112, 255, 4112,
				4112, 4112, 4351, 4112, 255, 10280, 65280, 65296,
				63496, 59432, 16160, 12072, 59400, 59432, 12064, 12072,
				65280, 61224, 10280, 10280, 61184, 61224, 10472, 10280,
				61456, 61456, 10287, 10280, 7952, 7952, 61456, 61456,
				248, 10280, 63, 10280, 7952, 7952, 65296, 65296,
				10495, 10280, 4336, 0, 31, 4112, 65535, 65535,
				3855, 3855, 65535, 0, 0, 65535, 61680, 61680,
				0, 0, 250, 0, 49152, 49152, 31784, 31744,
				25814, 19456, 34360, 49664, 27796, 28170, 64, 32768,
				14404, 33280, 33348, 14336, 21560, 21504, 4220, 4096,
				516, 0, 4112, 4096, 2, 0, 1592, 49152,
				31874, 31744, 17150, 512, 18074, 25088, 17554, 27648,
				61456, 65024, 58530, 39936, 31890, 19456, 34456, 57344,
				27794, 27648, 25746, 31744, 36, 0, 548, 0,
				4136, 17538, 10280, 10240, 33348, 10256, 16538, 24576,
				31898, 31232, 32400, 32256, 65170, 27648, 31874, 17408,
				65154, 31744, 65170, 33280, 65168, 32768, 31890, 23552,
				65040, 65024, 33534, 33280, 1026, 64512, 65072, 52736,
				65026, 512, 65120, 65024, 65152, 32256, 31874, 31744,
				65168, 24576, 31874, 32000, 65168, 28160, 25746, 19456,
				33022, 32768, 65026, 65024, 63494, 63488, 65036, 65024,
				60944, 60928, 57374, 57344, 36498, 57856, 254, 33280,
				49208, 1536, 130, 65024, 16512, 16384, 257, 256,
				128, 16384, 9258, 7680, 65058, 7168, 7202, 5120,
				7202, 65024, 7210, 6656, 4222, 36864, 4650, 15360,
				65056, 7680, 8894, 512, 1026, 48128, 65032, 13824,
				33534, 512, 15896, 15872, 15904, 7680, 7202, 7168,
				15912, 4096, 4136, 15872, 15904, 4096, 4650, 9216,
				8316, 8704, 15362, 15872, 14342, 14336, 15884, 15872,
				13832, 13824, 12810, 15360, 9770, 12800, 4204, 33280,
				238, 0, 33388, 4096, 16512, 16512, 3634, 3584
	]
},[DCPUHardware]);