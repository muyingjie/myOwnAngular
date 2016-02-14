function Scope(){
	//双$代表这是angular的私有属性
	this.$$watchers=[];
}
Scope.prototype.$watch=function(watchFn,listenerFn){
	var watcher={
		watchFn:watchFn,
		listenerFn:listenerFn || function(){},
		last:initWatchVal
	};
	this.$$watchers.push(watcher);
};
Scope.prototype.$digest=function(){
	var self=this;
	var newValue;
	var oldValue;
	var watcher;
	for(var i=0;i<this.$$watchers.length;i++){
		watcher=this.$$watchers[i];
		
		newValue=watcher.watchFn(self);
		oldValue=watcher.last;
		if(newValue!=oldValue){
			watcher.last=newValue;
			//listenerFn中第二个参数用三目运算是为了第一次调用时让newValue和oldValue相同
			watcher.listenerFn(
				newValue,
				oldValue === initWatchVal ? newValue : oldValue,
				self
			);
		}
	}
};

function initWatchVal(){}





