/**
 * Created by lenovo on 2017/2/13.
 */
// http backend
function $HttpBackendProvider() {
    this.$get = function() {
        return function(method, url, post, callback, headers, withCredentials) {
            var xhr = new window.XMLHttpRequest();
            // 第三个参数，是否异步
            xhr.open(method, url, true);
            _.forEach(headers, function(value, key) {
                xhr.setRequestHeader(key, value);
            });
            if (withCredentials) {
                xhr.withCredentials = true;
            }
            xhr.send(post || null);
            xhr.onload = function() {
                var response = ('response' in xhr) ? xhr.response :
                    xhr.responseText;
                var statusText = xhr.statusText || '';
                callback(xhr.status, response, xhr.getAllResponseHeaders(), statusText);
            };
            xhr.onerror = function() {
                callback(-1, null, '');
            };
        };
    };
}

// http
function $HttpProvider() {
    var defaults = {
        headers: {
            // 所有的请求都应该有Accept请求头，用于告诉服务器客户端希望得到的数据格式优先为json，其次是文本
            common: {
                Accept: 'application/json, text/plain, */*'
            },
            // 有数据传递的POST请求应该有Content-Type请求头，而GET请求由于不需要请求主体，因此不需要Content-Type请求头
            // 没有数据传递的POST请求由于没有请求主体，也不应该有Content-Type请求头，这个处理放在了$http函数内
            post: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            put: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            patch: {
                'Content-Type': 'application/json;charset=utf-8'
            }
        }
    };

    this.$get = ['$httpBackend', '$q', '$rootScope', function($httpBackend, $q, $rootScope) {
        // return function $http(config) {
        function $http(requestConfig) {
            var deferred = $q.defer();

            var config = _.extend({
                method: 'GET',
                // 可以在外部修改请求头，从而对发送的所有request请求都生效
                transformRequest: defaults.transformRequest
            }, requestConfig);
            config.headers = mergeHeaders(requestConfig);

            // 通过defaults变量也可以设置withCredentials
            if (_.isUndefined(config.withCredentials) && !_.isUndefined(defaults.withCredentials)) {
                config.withCredentials = defaults.withCredentials;
            }

            // 发出请求之前可能需要对请求头做一些调整，transformData用来做这个调整，该调整仅对当前的http请求生效
            var reqData = transformData(config.data, headersGetter(config.headers), config.transformRequest);

            // 没有数据传递的POST请求由于没有请求主体，也不应该有Content-Type请求头
            // if (_.isUndefined(config.data)) {
            if (_.isUndefined(reqData)) {
                _.forEach(config.headers, function(v, k) {
                    if (k.toLowerCase() === 'content-type') {
                        delete config.headers[k];
                    }
                });
            }

            if (_.isUndefined(config.data)) {
                _.forEach(config.headers, function(v, k) {
                    if (k.toLowerCase() === 'content-type') {
                        delete config.headers[k];
                    }
                });
            }

            // param3: 请求头信息
            function done(status, response, headersString, statusText) {
                status = Math.max(status, 0);
                // deferred.resolve({
                deferred[isSuccess(status) ? 'resolve' : 'reject']({
                    status: status,
                    data: response,
                    statusText: statusText,
                    headers: headersGetter(headersString),
                    config: config
                });
                //请求完成后进行脏检测循环
                if (!$rootScope.$$phase) {
                    $rootScope.$apply();
                }
            }
            // withCredentials参数：
            // 作用1：
            // 当xhr为同步请求时，有如下限制：
            //
            // xhr.timeout必须为0
            // xhr.withCredentials必须为 false
            // xhr.responseType必须为""（注意置为"text"也不允许）
            //
            // 若上面任何一个限制不满足，都会抛错，而对于异步请求，则没有这些参数设置上的限制。

            // 作用2：
            // 在发同域请求时，浏览器会将cookie自动加在request header中。但大家是否遇到过这样的场景：在发送跨域请求时，cookie并没有自动加在request header中
            // 造成这个问题的原因是：在CORS标准中做了规定，默认情况下，浏览器在发送跨域请求时，不能发送任何认证信息（credentials）如"cookies"和"HTTP authentication schemes"。除非xhr.withCredentials为true（xhr对象有一个属性叫withCredentials，默认值为false）。
            // 所以根本原因是cookies也是一种认证信息，在跨域请求中，client端必须手动设置xhr.withCredentials=true，且server端也必须允许request能携带认证信息（即response header中包含Access-Control-Allow-Credentials:true），这样浏览器才会自动将cookie加在request header中。
            // 另外，要特别注意一点，一旦跨域request能够携带认证信息，server端一定不能将Access-Control-Allow-Origin设置为*，而必须设置为请求页面的域名。
            $httpBackend(
                config.method,
                config.url,
                reqData, // config.data,
                done,
                config.headers,
                config.withCredentials //跨域相关设置
            );
            return deferred.promise;
        }
        //可以通过修改$http静态属性来修改默认的请求头
        $http.defaults = defaults;
        return $http;
    }];
    function isSuccess(status) {
        return status >= 200 && status < 300;
    }
    function mergeHeaders(config) {
        // return _.extend(
        //     {},
        //     defaults.headers.common,
        //     defaults.headers[(config.method || 'get').toLowerCase()],
        //     config.headers
        // );

        var reqHeaders = _.extend(
            {},
            config.headers
        );
        var defHeaders = _.extend(
            {},
            defaults.headers.common,
            defaults.headers[(config.method || 'get').toLowerCase()]
        );
        _.forEach(defHeaders, function(value, key) {
            var headerExists = _.any(reqHeaders, function(v, k) {
                return k.toLowerCase() === key.toLowerCase();
            });
            if (!headerExists) {
                reqHeaders[key] = value;
            }
        });
        // return reqHeaders;
        return executeHeaderFns(reqHeaders, config);
    }
    function executeHeaderFns(headers, config) {
        return _.transform(headers, function(result, v, k) {
            if (_.isFunction(v)) {
                // result[k] = v(config);
                v = v(config);
                if (_.isNull(v) || _.isUndefined(v)) {
                    delete result[k];
                } else {
                    result[k] = v;
                }
            }
        }, headers);
    }
    function headersGetter(headers) {
        var headersObj;
        return function(name) {
            headersObj = headersObj || parseHeaders(headers);
            // return headersObj[name.toLowerCase()];
            if (name) {
                return headersObj[name.toLowerCase()];
            } else {
                return headersObj;
            }
        };
    }
    function parseHeaders(headers) {
        if (_.isObject(headers)) {
            return _.transform(headers, function(result, v, k) {
                result[_.trim(k.toLowerCase())] = _.trim(v);
            }, {});
        } else {
            var lines = headers.split('\n');
            return _.transform(lines, function(result, line) {
                var separatorAt = line.indexOf(':');
                var name = _.trim(line.substr(0, separatorAt)).toLowerCase();
                var value = _.trim(line.substr(separatorAt + 1));
                if (name) {
                    result[name] = value;
                }
            }, {});
        }
    }
    // 在ajax发送之前对数据进行加工
    function transformData(data, headers, transform) {
        if (_.isFunction(transform)) {
            return transform(data, headers);
        } else {
            // return data;
            // transform里面可以存放多个函数分别对即将发送的请求头做处理
            return _.reduce(transform, function(data, fn) {
                return fn(data, headers);
            }, data);
        }
    }
}

// httpProvider
function $HttpProvider() {
    var defaults = this.defaults = {
    };
}