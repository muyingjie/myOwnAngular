//脏检测——最基础架构
function Scope(){
    //存放页面中所有的watcher，watcher的来源有：
    //1、手动通过scope对象上$watch方法绑定上去
    this.$$watchers = [];
}
Scope.prototype.$watch = function (watchFn, listenerFn) {
    var watcher = {
        watchFn: watchFn,
        listenerFn: listenerFn || function() {},
        //为防止和其他值重复，此处放置了一个函数确保其唯一性
        last: initWatchVal
    };
    this.$$watchers.push(watcher);
};
Scope.prototype.$digest = function () {
    var self = this;
    var newValue;
    var oldValue;
    _.forEach(this.$$watchers, function (watcher) {
        newValue = watcher.watchFn(self);
        oldValue = watcher.last;
        if(newValue !== oldValue){
            watcher.last = newValue;
            watcher.listenerFn(
                newValue,
                (oldValue === initWatchVal ? newValue : oldValue),
                self
            );
        }
    });
};
function initWatchVal() {}


//测试代码=====================================================================================
var scope = new Scope();
scope.someValue = "a";
var watchFn = function (){ return scope.someValue; };
var listenerFn = function (){ console.log("someValue变了"); };
scope.$watch(watchFn, listenerFn);
scope.$digest(); //someValue变了

var watchFn2 = function() {
    //当前Controller触发脏检测的时候就执行这里
    //如果是出于此目的，这里尽量不要有返回值以避免不必要的性能浪费
};
scope.$watch(watchFn2);