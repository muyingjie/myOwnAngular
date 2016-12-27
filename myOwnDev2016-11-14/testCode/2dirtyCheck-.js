//脏检测
//在listener函数中改变scope上一个属性的值时，而且有另外一个watcher正在监听该属性，该watcher也应该触发listener

//我们需要将脏检测机制改为一遍又一遍的脏检测，直到被watch的属性不再改变
//为此我们要做出如下修改：
//1、将$digest函数的名字改为$$digestOnce，该函数返回一个值，该值代表本轮脏检测是否有值改变，
//  该函数将遍历所有watchers，如果有任何一个watcher监听的值变了，那么该函数返回值就是true
//2、重新定义$digest，这次$digest函数要做的事情是循环执行脏检测，知道$$digestOnce函数返回true
//  即所有watcher所监听的属性都不再变
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