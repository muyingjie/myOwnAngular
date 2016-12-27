/**
 * Created by yj on 2016/12/19.
 */
//1、最多脏检测10次
//2、上一个版本实现的脏检测有明显的问题，那就是即使dirty变成了true，仍然会执行完所有的watcher，这显然没有必要
function Scope(){
    //存放页面中所有的watcher，watcher的来源有：
    //1、手动通过scope对象上$watch方法绑定上去
    this.$$watchers = [];
    //最后一次脏检测检测到的数据不一致的watcher
    this.$$lastDirtyWatch = null;
}
Scope.prototype.$watch = function (watchFn, listenerFn) {
    var watcher = {
        watchFn: watchFn,
        listenerFn: listenerFn || function() {},
        //为防止和其他值重复，此处放置了一个函数确保其唯一性
        last: initWatchVal
    };
    this.$$watchers.push(watcher);
    this.$$lastDirtyWatch = null;
};
Scope.prototype.$digest = function () {
    var ttl = 10;
    var dirty;
    this.$$lastDirtyWatch = null;
    do{
        dirty = this.$$digestOnce();
        if(dirty && (!ttl--)){
            throw "脏检测10次之后仍然不稳定";
        }
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
            self.$$lastDirtyWatch = watcher;
            watcher.last = newValue;
            watcher.listenerFn(
                newValue,
                (oldValue === initWatchVal ? newValue : oldValue),
                self
            );
            dirty = true;
        }else if(watcher == self.$$lastDirtyWatch){
            //在所有watcher全检测为true的前一次如果发现当前watcher就是所有watcher中最后变脏的那个，就可以停止检测了
            return false;
        }
    });
    return dirty;
};
function initWatchVal() {}
//=========================================================================
//防止循环检测
scope.counterA = 0;
scope.counterB = 0;
scope.$watch(
    function(scope) { return scope.counterA; },
    function(newValue, oldValue, scope) {
        scope.counterB++;
    }
);
scope.$watch(
    function(scope) { return scope.counterB; },
    function(newValue, oldValue, scope) {
        scope.counterA++;
    }
);
//=========================================================================
//每次脏检测时尽早结束
scope.array = _.range(100);
var watchExecutions = 0;
_.times(100, function(i) {
    scope.$watch(
        function(scope) {
            watchExecutions++;
            return scope.array[i];
        },
        function(newValue, oldValue, scope) {
        }
    );
});
scope.$digest();
expect(watchExecutions).toBe(200);
scope.array[0] = 420;
scope.$digest();
expect(watchExecutions).toBe(301);
//============================================================================
//$watch的第二个参数里面增加一个watcher
scope.aValue = 'abc';
scope.counter = 0;
scope.$watch(
    function(scope) { return scope.aValue; },
    function(newValue, oldValue, scope) {
        scope.$watch(
            function(scope) { return scope.aValue; },
            function(newValue, oldValue, scope) {
                scope.counter++;
            }
        );
    }
);
scope.$digest();
expect(scope.counter).toBe(1);