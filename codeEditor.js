var DCPUEditor=new Class({
	height: 400,
	width: 400,
	init: function(div,ide) {
		this.codeMirror=CodeMirror(div,{
			smartIndent: false,
			lineNumbers: true,
			autofocus: true,
			mode: 'dcpu',
			pollInterval: 5000,
			workTime: 100,
			workDelay: 1000,
			onGutterClick: bind(this,this.gutterClick),
			onKeyEvent: bind(this,this.keyEvent),
			onScroll: bind(this,this.scrollListener)
		});
		
		this.ide=ide;
		
		var scroller=this.codeMirror.getScrollerElement();
		
		scroller.style.width=this.height+'px';
		scroller.style.height=this.width+'px';
		
		this.codeMirror.refresh();
		
		this.breakpointsOn={};
			
		this.scrollDirty=false;
		this.lastScroll=0;
	},
	loadRemote: function(url) {
		getFromUrl(url,bind(this,function(text) { this.codeMirror.setValue(text) }));
	},
	getValue: function() {
		return this.codeMirror.getValue();
	},
	highlightError: function(n) {
		this.codeMirror.setLineClass(n,null,'errorLine');
	},
	setSteppingLine: function(n) {
		if (typeof this.lastSteppingLine!='undefined' && this.lastSteppingLine>=0) {
			this.codeMirror.setLineClass(this.lastSteppingLine,null,null);
		}
		
		if (n>=0) {
			var pos=this.codeMirror.charCoords({line: n, ch: 0},'local');
			var delta=pos.y - this.lastScroll;
			if (this.scrollDirty || delta>(this.height-20) || delta<0) {
				this.ignoreScroll=true;
				this.scrollDirty=false;
				this.lastScroll=pos.y;
				this.codeMirror.scrollTo(pos.x,pos.y);
				this.codeMirror.focus();
			}
			
			this.codeMirror.setLineClass(n,null,'currentLine');
		}
		
		this.lastSteppingLine=n;
	},
	refresh: function() {
		this.codeMirror.refresh();
	},
	gutterClick: function(cm,line,e) {
		if (!this.breakpointsOn[line]) {
			if (this.ide.stateDisplay.setLineBreakpoint(line)) {
				console.log("Setting marker at: " + line);
				this.codeMirror.setMarker(line,'>%N%','breakpoint');
				this.breakpointsOn[line]=true;
			}
		} else {
			this.codeMirror.clearMarker(line);
			this.ide.stateDisplay.clearLineBreakpoint(line);
			delete this.breakpointsOn[line];
		}
	},
	keyEvent: function(cm,e) {
		if (e.type=='keydown') {
			switch(e.keyCode) {
			case 113:
				this.ide.reset();
				break;
			case 118:
				this.ide.pause();
				break;
			case 119:
				this.ide.run();
				break;
			case 120:
				this.ide.load();
				break;
			case 121:
				this.ide.step();
				break;
			}
		}
		
		return false;
	},
	scrollListener: function() {
		if (!this.ignoreScroll) this.scrollDirty=true;
		this.ignoreScroll=false;
	}
});