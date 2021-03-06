
var anonymouse = [],
config = {},
STATUS = {
  'created': 0,
  'save': 1,
  'ready': 2,
  'compiling': 3,
  'compiled': 4
},
circularStack = [],
directorys = [],
isInitConfig;

//help
var getPureDependencies = function(mod) {
  var id = mod.id;
  var deps = filter(mod.dependencies, function(dep) {
    circularStack.push(id);
    var isCircular = isCircularWaiting(lithe.cache[resolve(dep)]);
    if (isCircular) {
      //the circular is ready
      circularStack.push(id);
    }
    circularStack.pop();
    return ! isCircular;
  });
  return createUrls(deps);
};

var isCircularWaiting = function(mod) {
  if (!mod || mod.status !== STATUS.save){
    return false;
  }
  circularStack.push(mod.id);
  var deps = mod.dependencies;
  if (deps.length) {
    if (isOverlap(deps, circularStack)){
      return true;
    }
    for (var i = 0; i < deps.length; i++) {
      if (isCircularWaiting(lithe.cache[resolve(deps[i])])){
        return true;
      }
    }
  }
  circularStack.pop();
  return false;
};

var isOverlap = function(arrA, arrB) {
  var arrC = arrA.concat(arrB);
  return arrC.length > unique(arrC).length;
};

var createUrls = function(urls) {
  if(isString(urls)){
    urls = [urls];
  }
  return map(urls, function(url) {
    return resolve(url);
  });
};

var fetchMods = function(urls, cb) {
  urls = createUrls(urls);
  LEVENTS.trigger('start', [urls]);
  var loadUris = filter(urls, function(url) {
    return url && (!lithe.cache[url] || lithe.cache[url].status < STATUS.ready);
  }),
  len = loadUris.length;
  if (len === 0) {
    cb();
    return;
  }
  var queue = len;

  var restart = function(mod) {
    if((mod || {}).status < STATUS.ready){
      mod.status = STATUS.ready;
    }
    --queue;
    if(queue === 0){
      cb();
    }
  };

  forEach(loadUris, function(url) {
    var mod = lithe.get(url);
    function success(style) {
      LEVENTS.trigger('fetchsuccess', [mod, style]);
      if (mod.status >= STATUS.save) {
        var deps = getPureDependencies(mod);
        if(deps.length){
          fetchMods(deps, function() {
            restart(mod);
          });
        }else{
          restart(mod);
        }
      } else if (style) {
        restart(mod);
      } else {
        restart();
      }
    }
    if(mod.status < STATUS.save){
      fetch(url, success);
    }else{
      success();
    }
  });
};

var saveAnonymouse = function() {
  forEach(anonymouse, function(meta) {
    var anonymousemod = lithe.get(meta.id);
    anonymousemod._save(meta);
  });
  anonymouse = [];
};

var realUse = function(urls, cb) {
  fetchMods(urls, function() {
    urls = createUrls(urls);
    var args = map(urls, function(url) {
      return url ? lithe.get(url)._compile() : null;
    });
    if (isFunction(cb)) {
      cb.apply(null, args);
    }
    LEVENTS.trigger('end');
  });
};


var setConfig = function(cg) {
  config = cg;
  directorys = [];
  var alias = config.alias,
  i, alia, dir;
  if (alias) {
    for (i in alias) {
      alia = alias[i];
      if (isDir(alia)) {
        dir = {};
        dir[i] = alia;
        directorys.push(dir);
      }
    }
  }
  isInitConfig = true;
  if (config.basepath){
    lithe.basepath = config.basepath;
  }
  lithe.config = config;
  CONFIGSTMAP = config.timestamp;
};

var Module = function(url) {
  this.id = url;
  this.status = 0;
  this.dependencies = [];
  this.exports = null;
  this.parent = [];
  this.factory = noop;
};

extend(Module.prototype, {
  _compile: function() {
    var mod = this;
    if (mod.status === STATUS.compiled){
      return mod.exports;
    }
    if (mod.status < STATUS.save){
      return null;
    }
    mod.status = STATUS.compiling;
    function require(id) {
      id = normalize(resolve(id), true);
      var child = lithe.cache[id];
      if (!child){
        return null;
      }
      if (child.status === STATUS.compiling){
        return child.exports;
      }
      child.parent = mod;
      return child._compile();
    }
    require.cache = lithe.cache;
    mod.require = require;
    mod.exports = {};
    var fun = mod.factory;
    if (isFunction(fun)){
      runModuleContext(fun, mod);
    }
    mod.status = STATUS.compiled;
    lithe.events.trigger('compiled', [mod]);
    return mod.exports;
  },
  _save: function(meta) {
    if (this.status < STATUS.save) {
      this.id = meta.id;
      this.name = meta.name;
      this.dependencies = meta.deps;
      this.factory = meta.factory;
      this.status = STATUS.save;
    }
  }
});

var lithe = extend({
  basepath: BASEPATH,
  events: LEVENTS,
  cache: {},
  get: function(url) {
    url = normalize(url, true);
    if(lithe.cache[url]){
      return lithe.cache[url];
    }else{
      lithe.cache[url] = new Module(url);
      return lithe.cache[url];
    }
  },
  define: function(id, factory) {
    var deps = getDependencies(factory.toString());
    var meta = {
      id: resolve(id),
      name: id,
      deps: deps,
      factory: factory
    };
    anonymouse.push(meta);
    saveAnonymouse();
  },
  use: function(urls, cb) {
    if(!CONFIG || isInitConfig){
      realUse(urls, cb);
    }else{
      realUse(CONFIG, function(cg) {
        setConfig(cg);
        realUse(urls, cb);
      });
    }
  },
  load:getscript,
  setConfig:setConfig
});

if (CONFIG){
  CONFIG = createUrls(CONFIG);
}

