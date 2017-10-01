const uuid = require("uuid");
const ACTIONS_TYPES = ["WHO_IS", "I_AM", "CALL", "RETURN"].reduce((map, action) => Object.assign(map, { [action]: action }), {});

const call = (type, payload) => JSON.stringify({ type, payload });

module.exports = coven => {
  const remoteModules = {};
  const localModules = {};
  const pendingCalls = {};

  const localCall = (moduleName, method, args) =>
    new Promise((resolve, reject) => {
      if (!localModules[moduleName]) {
        return reject({ message: `Module ${moduleName} not found` });
      }
      if (!localModules[moduleName][method]) {
        return reject({ message: `Method ${method} of module ${moduleName} not found` });
      }
      return localModules[moduleName][method](args, resolve, reject);
    });

  const resolveRemoteCall = (callId, value, rejected) => {
    if (rejected) {
      pendingCalls[callId].reject(value);
    } else {
      pendingCalls[callId].resolve(value);
    }
    delete pendingCalls[callId];
  };

  const resolveLocalCall = (callId, moduleName, method, args) =>
    localCall(moduleName, method, args)
      .then(value => call(ACTIONS_TYPES.RETURN, { callId, value }))
      .catch(value => call(ACTIONS_TYPES.RETURN, { callId, value, rejected: true }));

  const getModuleProxy = moduleName =>
    new Proxy(
      {},
      {
        get(_, method) {
          return (...args) => {
            const callId = uuid();
            pendingCalls[callId] = {};
            pendingCalls[callId].promise = new Promise((resolve, reject) =>
              Object.assign(pendingCalls[callId], { resolve, reject })
            );
            remoteModules[moduleName].promise.then(peer =>
              peer.send(call(ACTIONS_TYPES.CALL, { moduleName, method, args, callId }))
            );
            const clear = () => delete pendingCalls[callId];
            return pendingCalls.promise;
          };
        }
      }
    );

  const handleAction = (peer, action) => {
    switch (action.type) {
      case ACTIONS_TYPES.WHO_IS: {
        if (localModules[action.payload]) {
          peer.send(call(ACTIONS_TYPES.I_AM, action.payload));
        }
        return;
      }
      case ACTIONS_TYPES.I_AM: {
        const moduleName = action.payload;
        if (!remoteModules[moduleName] || remoteModules[moduleName].resolved) {
          remoteModules[moduleName] = {
            resolve: true,
            promise: Promise.resolve(peer)
          };
        } else if (remoteModules[moduleName]) {
          remoteModules[moduleName].resolved = true;
          remoteModules[moduleName].resolve(peer);
        }
        return;
      }
      case ACTIONS_TYPES.CALL: {
        const { callId, moduleName, method, args } = action.payload;
        return resolveLocalCall(callId, moduleName, method, args).then(action => peer.send(action));
      }
      case ACTIONS_TYPES.RETURN: {
        const { callId, value, rejected } = action.payload;
        return resolveRemoteCall(callId, value, rejected);
      }
    }
  };
  coven.on("peer", peer => {
    peer.on("data", raw => {
      const action = JSON.parse(raw.toString("utf8"));
      handleAction(peer, action);
    });
    Object.keys(localModules).forEach(moduleName => peer.send(call(ACTIONS_TYPES.I_AM, moduleName)));
  });

  function getModule(moduleName) {
    if (!remoteModules[moduleName]) {
      const moduleReq = {};
      moduleReq.promise = new Promise(resolve => {
        moduleReq.resolve = resolve;
      });
      remoteModules[moduleName] = moduleReq;
      coven.broadcast(call(ACTIONS_TYPES.WHO_IS, moduleName));
    }
    return getModuleProxy(moduleName);
  }

  getModule.module = (moduleName, exported) => {
    localModules[moduleName] = exported;
    coven.broadcast(call(ACTIONS_TYPES.I_AM, moduleName));
  };

  return getModule;
};
