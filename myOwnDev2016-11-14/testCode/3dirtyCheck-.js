//脏检测
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
    var dirty;
    do{
        dirty = this.$$digestOnce();
    }while(dirty);
};
Scope.prototype.$$digestOnce = function () {
    var self = this;
    var newValue;
    var oldValue;
    var dirty;
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
            dirty = true;
        }
    });
    return dirty;
};
function initWatchVal() {}


//测试代码=====================================================================================
var scope = new Scope();
scope.name = "Jane";
//注意：我们在下面的watcher中当中先故意watch了一个在该watch执行时scope上根本不存在的属性nameUpper
scope.$watch(
    function (scope) { return scope.nameUpper;},
    function (newValue, oldValue, scope){
        if(newValue){
            scope.initial = newValue.substring(0, 1) + ".";
        }
    }
);
scope.$watch(
    function (scope) { return scope.name; },
    function (newValue, oldValue, scope){
        if(newValue){
            scope.nameUpper = newValue.toUpperCase();
        }
    }
);
scope.$digest();
console.log(scope.initial);