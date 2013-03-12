function byId(elementId) {
	return document.getElementById(elementId);
}

function isIE() {
	return /msie/i.test(navigator.userAgent) && !/opera/i.test(navigator.userAgent);
}

function isFF() {
	return /firefox/i.test(navigator.userAgent);
}

function isChrome() {
	return /chrom/i.test(navigator.userAgent);
}

function addEvent(obj, evType, fn, useCapture){
  if (obj.addEventListener){
    obj.addEventListener(evType, fn, useCapture);
    return true;
  } else if (obj.attachEvent){
    var r = obj.attachEvent("on"+evType, fn);
    return r;
  } 
}

function mixin(dest,src) {
	for (var p in src) {
		dest[p]=src[p];
	}
	
	return dest;
}

var bind;
if (Function.prototype.bind) {
	bind=function(theThis,f) {
		return Function.prototype.bind.call(f,theThis);
	};
} else {
	bind=function(theThis,f) {
		return function() {
			return f.apply(theThis,[].slice.apply(arguments));
		}
	};
}

function newEle(tagname,text,className,id) {
	var ele=document.createElement(tagname);
	
	if (typeof text!='undefined') {
		ele.appendChild(document.createTextNode(text));
	}
	
	if (id) {
		ele.id=id;
	}
	
	if (className) {
		ele.className=className;
	}
	
	return ele;
}

Array.prototype.each=function(f) {
	for(var i=0;i<this.length;i++) {
		f(this[i],i);
	}
}

Array.prototype.find=function(f) {
	for(var i=0;i<this.length;i++) {
		if (f(this[i],i)) return this[i];
	}
	
	return null;
}

function Class(body,inherit) {
	var thisClass=function() {
		this.thisClass=thisClass;
		this.inheritFrom=inherit;
		if (this.init) {
			this.init.apply(this,[].slice.apply(arguments));
		}
	};
	
	if (inherit) {
		inherit.reverse().each(function(i) {
			mixin(thisClass.prototype,i.prototype);
		});
	}
	
	mixin(thisClass.prototype,body);
	
	return thisClass;
}

var trimRE=/^\s*(.*?)\s*$/;
function trim(s) {
	return trimRE.exec(s)[1];
}

var isArray= Array.isArray || function(a) {
	return (a && Object.prototype.toString.call(a) === '[object Array]');
}

function isFunc(f) {
	return (f && Object.prototype.toString.call(f) === '[object Function]');
}

function zeroPad(s,l) {
	while (s.length < 4) {
		s='0' + s;
	}
	return s;
}

function getFromUrl(url,cb,errCb) {
	var xhr=new XMLHttpRequest();
	
	xhr.onreadystatechange=function() {
		if (xhr.readyState==4) {
			if (xhr.status==200) {
				if (cb) cb(xhr.responseText);
			} else {
				if (errCb) errCb(xhr.responseText);
			}
		}
	};
	
	xhr.open('GET',url,true);
	xhr.send();
	
}

function text2html(text) {
	return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>');
}
	
