module.exports = function(RED) {
  var telegramBot = require("node-telegram-bot-api");

  function BotConfigNode(n) {
    RED.nodes.createNode(this, n);
    var node = this;

    this.botname = n.botname;
    this.status = "disconnected";
    this.usernames = (n.usernames ? n.usernames.split(",") : [])
        .map(function(name){ return name.trim(); })
        .filter(function (name){ return isNaN(name) });
    this.userIds = (n.usernames ? n.usernames.split(",") : [])
        .map(function(name){ return name.trim(); })
        .filter(function (name){ return !isNaN(name) })
        .map(function(id){ return parseInt(id); });
    this.chatIds = (n.chatIds ? n.chatIds.split(",") : [])
        .map(function(id){ return id.trim(); })
        .filter(function (id){ return !isNaN(id) })
        .map(function(id){ return parseInt(id); });
    this.pollInterval = parseInt(n.pollInterval);
    this.nodes = [];

    console.log( "-config- usernames = ", this.usernames);
    console.log( "-config- userIds = ", this.userIds);
    console.log( "-config- chatIds = ", this.chatIds);

    if (isNaN(this.pollInterval)) {
      this.pollInterval = 300;
    }

    this.getTelegramBot = function () {
      if (!this.telegramBot) {
        if (this.credentials) {
          this.token = this.credentials.token;

          if (this.token) {
            this.token = this.token.trim();

            var polling = {
              autoStart: true,
              interval: this.pollInterval
            };

            var options = {
              polling: polling
            };

            this.telegramBot = new telegramBot(this.token, options);
            node.status = "connected";

            this.telegramBot.on("error", function(error){
              node.warn(error.message);

              node.abortBot(error.message, function(){
                node.warn("Bot stopped: fatal error");
              });
            });

            this.telegramBot.on("polling_error", function(error){
              node.warn(error.message);

              var stopPolling = false;
              var hint;

              if (error.message == "ETELEGRAM: 401 Unauthorized") {
                hint = `Please check that your bot token is valid: ${node.token}`;
                stopPolling = true;
              } else if (error.message.startsWith("EFATAL: Error: connect ETIMEDOUT")) {
                hint = "Timeout connecting to server. Trying again.";
              } else if (error.message.startsWith("EFATAL: Error: read ECONNRESET")) {
                hint = "Network connection may be down. Trying again.";
              } else if (error.message.startsWith("EFATAL: Error: getaddrinfo ENOTFOUND")) {
                hint = "Network connection may be down. Trying again.";
              } else {
                hint = "Unknown error. Trying again.";
              }

              if (stopPolling) {
                node.abortBot(error.message, function(){
                  node.warn(`Bot stopped: ${hint}`);
                });
              } else {
                node.warn(hint);
              }
            });

            this.telegramBot.on("webhook_error", function(error){
              node.warn(error.message);

              node.abortBot(error.message, function() {
                node.warn("Bot stopped: webhook error");
              })
            });
          }
        }
      }

      return this.telegramBot;
    };

    this.on("close", function(done){
      node.abortBot("closing", done);
    });

    this.abortBot = function(hint, done){
      if (node.telegramBot !== null && node.telegramBot._polling) {
        node.telegramBot.stopPolling()
                        .then(function(){
                          node.telegramBot = null;
                          node.status = "disconnected";
                          node.setNodeStatus({ fill: "red", shape: "ring", text: `bot stopped (${hint})`});
                          done();
                        });
      } else {
        node.status = "disconnected";
        node.setNodeStatus({ fill: "red", shape: "ring", text: `bot stopped (${hint})`});
        done();
      }
    };

    this.isAuthorizedUserId = function(userId) {
      return (node.userIds.length === 0) || (node.userIds.indexOf(userId) >= 0);
    };

    this.isAuthorizedUserName = function(username) {
      return (node.usernames.length === 0) || (node.usernames.indexOf(username) >= 0);
    };

    this.isAuthorizedChat = function(chatId) {
      return (node.chatIds.length === 0) || (node.chatIds.indexOf(chatId) >= 0);
    };

    this.isAuthorized = function(chatId, userId, username) {
      var isAuthorizedUserId = node.isAuthorizedUserId(userId);
      var isAuthorizedUserName = node.isAuthorizedUserName(username);
      var isAuthroizedChat = node.isAuthorizedChat(chatId);
      console.log(` -config- isAuthorized(chatId=${chatId}, userId=${userId}, username=${username})`);
      console.log(` -config- isAuthorizedUserId=${isAuthorizedUserId}, isAuthorizedUserName=${isAuthorizedUserName}, isAuthroizedChat=${isAuthroizedChat})`);
      console.log(` -config- (isAuthorizedUserId || isAuthorizedUserName) && isAuthroizedChat = ${(isAuthorizedUserId || isAuthorizedUserName) && isAuthroizedChat})`);
      return (isAuthorizedUserId || isAuthorizedUserName) && isAuthroizedChat;
    };

    this.findChatId = function(nodeChatId, receivedTelegramMeta) {
        if (nodeChatId && !isNaN(nodeChatId)) {
          // node configured chat ID is first priority
          console.log(" -config- using chatId from node config : " + nodeChatId)
          return nodeChatId
        }
        if (receivedTelegramMeta && !isNaN(receivedTelegramMeta.chatId)) {
          // chat ID from previous Telegram bot node - to allowed chained conversation with more than one chat ID
          console.log(" -config- using chatId from previous node : " +  receivedTelegramMeta.chatId)
          return receivedTelegramMeta.chatId;
        }
        if (this.chatIds.length > 0) {
          // first allowed chat ID - to allow for lazy configuration of only one chat ID
          console.log(" -config- using chatId from bot config : " + this.chatIds[0])
          return this.chatIds[0]
        }
        utils.abortBot("Unable to find which chat ID to use for next payload", () => null);
    };

    this.register = function(n) {
      if (node.nodes.indexOf(n) === -1) {
        node.nodes.push(n);
      } else {
        node.warn(`Node ${n.id} registered more than once at the configuration node. Ignoring.`);
      }
    };

    this.setNodeStatus = function(status) {
      node.nodes.forEach(function(node){
        node.status(status);
      });
    };
  }

  RED.nodes.registerType("telegrambot-config", BotConfigNode, {
    credentials: {
      token: { type: "text" }
    }
  });
};
