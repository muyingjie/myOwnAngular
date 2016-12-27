/**
 * Created by yj on 2016/12/20.
 */
//$eval：$scope下的一个方法，该方法用于执行一段程序，程序内部可以拿到$scope对象，个人感觉这个方法并没有什么用
//      官方解释是有些代码可以更加明确执行环境，而且$eval是$apply的基础，可能最有用的地方在于表达式部分，跟$watch类似
//      $eval也可以传入一个表达式，例如：$eval("data.isShow")
//$apply：很重要的方法，用于外部代码改变scope上的数据时将其加入脏检测队列中，angular和第三方库配合使用时会用到
//$evalAsync：延迟执行，具体延迟到什么时候执行，由浏览器决定，如果我们在脏检测的过程中延迟执行一个函数，这个函数可以保证在脏检测循环中被执行
function Scope(){
    //存放页面中所有的watcher，watcher的来源有：
    //1、手动通过scope对象上$watch方法绑定上去
    this.$$watchers = [];
    //最后一次脏检测检测到的数据不一致的watcher
    this.$$lastDirtyWatch = null;
    //延迟队列
    this.$$asyncQueue = [];
}
Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
    var watcher = {
        watchFn: watchFn,
        listenerFn: listenerFn || function() {},
        //对象深层次比较
        valueEq: !!valueEq,
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
        while (this.$$asyncQueue.length) {
            var asyncTask = this.$$asyncQueue.shift();
            asyncTask.scope.$eval(asyncTask.expression);
        }
        dirty = this.$$digestOnce();
        // if(dirty && (!ttl--)){
        if((dirty || this.$$asyncQueue) && (!ttl--)){
            throw "脏检测10次之后仍然不稳定";
        }
    }while(dirty || this.$$asyncQueue.length); //加上this.$$asyncQueue.length这个条件的原因是考虑在$watch的第一个参数中向$$asyncQueue里面添加函数的情况，确保其执行，但同时该循环也就成了死循环，因此需要在$$digestOnce完了之后加强判断
};
Scope.prototype.$$digestOnce = function () {
    var self = this;
    var newValue;
    var oldValue;
    var dirty;
    _.forEach(this.$$watchers, function (watcher) {
        newValue = watcher.watchFn(self);
        oldValue = watcher.last;
        // if(newValue !== oldValue){
        if(!self.$$areEqual(newValue, oldValue, watcher.valueEq)){
            self.$$lastDirtyWatch = watcher;
            // watcher.last = newValue;
            watcher.last = (watcher.valueEq ? _.clone(newValue) : newValue);
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
Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
    if (valueEq) {
        return _.isEqual(newValue, oldValue);
    } else {
        return newValue === oldValue ||
            (typeof newValue == "number" && typeof oldValue == "number" && isNaN(newValue) && isNaN(oldValue));
    }
};
Scope.prototype.$eval = function (expr, locals) {
    return expr(this, locals);
};
Scope.prototype.$apply = function(expr) {
    try {
        return this.$eval(expr);
    } finally {
        this.$digest();
    }
};
Scope.prototype.$evalAsync = function (expr) {
    this.$$asyncQueue.push({
        scope: this, //存储scope属性是为了接下来要实现的scope继承
        expression: expr
    });
};
function initWatchVal() {}
//==============================================================================
// scope.aValue = 'someValue';
// scope.counter = 0;
// scope.$watch(
//     function(scope) {
//         return scope.aValue;
//     },
//     function(newValue, oldValue, scope) {
//         scope.counter++;
//     }
// );
// scope.$digest();
// expect(scope.counter).toBe(1);
// scope.$apply(function(scope) {
//     scope.aValue = 'someOtherValue';
// });
// expect(scope.counter).toBe(2);
//===============================================================================$evalAsync
// scope.aValue = [1, 2, 3];
// scope.asyncEvaluated = false;
// scope.asyncEvaluatedImmediately = false;
// scope.$watch(
//     function(scope) { return scope.aValue; },
//     function(newValue, oldValue, scope) {
//         scope.$evalAsync(function(scope) {
//             scope.asyncEvaluated = true;
//         });
//         scope.asyncEvaluatedImmediately = scope.asyncEvaluated;
//     }
// );
// scope.$digest();
// expect(scope.asyncEvaluated).toBe(true);
// expect(scope.asyncEvaluatedImmediately).toBe(false);
//=================================================================watch中添加到异步队列中
// scope.aValue = [1, 2, 3];
// scope.asyncEvaluatedTimes = 0;
// scope.$watch(
//     function(scope) {
//         if (scope.asyncEvaluatedTimes < 2) {
//             scope.$evalAsync(function(scope) {
//                 scope.asyncEvaluatedTimes++;
//             });
//         }
//         return scope.aValue;
//     },
//     function(newValue, oldValue, scope) { }
// );
// scope.$digest();
// expect(scope.asyncEvaluatedTimes).toBe(2);