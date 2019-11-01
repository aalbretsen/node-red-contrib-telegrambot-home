var utils = require('../../lib/utils.js');

module.exports = function(RED) {
  function SwitchNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    // Get base configuration
    this.bot = RED.nodes.getNode(config.bot);
    this.chatId = parseInt(config.chatId);
    this.rowSize = parseInt(config.rowSize) || 0;
    this.question = config.question || "";
    this.answers = config.answers || [];
    this.timeoutValue = config.timeoutValue || null;
    this.timeoutUnits = config.timeoutUnits || null;
    this.timeoutCallback = null;
    this.autoAnswerCallback = config.autoAnswerCallback;

    // Initialize bot
    utils.initializeBot(node);

    if (this.timeoutValue !== null) {
      if (this.timeoutUnits === null) {
        utils.updateNodeStatusFailed(node, "timeout units not provided");
        return;
      }

      this.timeoutDuration = utils.timeUnits(parseInt(this.timeoutValue, 10), this.timeoutUnits);

      if (this.timeoutDuration === NaN) {
        utils.updateNodeStatusFailed(node, "timeout not parsable");
        return;
      }

      if (this.timeoutDuration <= 0) {
        utils.updateNodeStatusFailed(node, "timeout should be greater than 0");
        return;
      }
    }

    // Compute output ports
    var portCount = (this.timeoutValue === null) ? this.answers.length : this.answers.length + 1;
    var ports = new Array(portCount);

    for (var i = 0; i < portCount; i++) {
      ports[i] = null;
    }

    this.on("input", function(msg){
      var question = this.question || msg.payload;
      var answers = this.answers || [];
      console.log(" -switch- this.chatId " + this.chatId);
      console.log(" -switch- msg.telegram ", msg.telegram);
      var configuredChatId = node.bot.findChatId(this.chatId, msg.telegram);
      console.log(" -switch- configuredChatId " + configuredChatId);
      var messageIsMarkupAnswer = msg.telegram && msg.telegram.autoAnswerCallback && msg.telegram.callbackQueryId;
      var alterMessageFromPreviousNode = !this.chatId && messageIsMarkupAnswer;

      if (question && answers.length > 0) {
        var listener = function(botMsg){
          console.log(' -switch- botMsg', botMsg);
          var username = botMsg.from.username;
          var userId = botMsg.from.id;
          var chatId = botMsg.message.chat.id;
          var messageId = botMsg.message.message_id;
          var callbackQueryId = botMsg.id;

          console.log(' -switch- chatId', chatId);
          console.log(' -switch- configuredChatId', configuredChatId);
          console.log(' -switch- chatId === configuredChatId', chatId === configuredChatId);

          console.log(' -switch- messageId', messageId);
          console.log(' -switch- msg.telegram.messageId', msg.telegram.messageId);
          console.log(' -switch- messageId === msg.telegram.messageId', messageId === msg.telegram.messageId);

          if (botMsg.data && chatId === configuredChatId && messageId === msg.telegram.messageId) {
            if (node.bot.isAuthorized(chatId, userId, username)) {
              // Remove this listener since we got our reply
              node.telegramBot.removeListener("callback_query", listener);

              // Clear the timeout
              if (node.timeoutCallback) {
                clearTimeout(node.timeoutCallback);
              }

              // Update node status
              utils.updateNodeStatusSuccess(node);

              if (node.autoAnswerCallback) {
                // Answer the callback so progress can stop showing
                node.telegramBot.answerCallbackQuery(callbackQueryId).then(function(sent){
                  // nothing to do here
                });

                if (!alterMessageFromPreviousNode) {
                  // Remove quick reply options
                  node.telegramBot.editMessageReplyMarkup("{}", { chat_id: chatId, message_id: messageId }).then(function(sent){
                   // nothing to do here
                  });
                }
              }

              // Augment original message with additional Telegram info
              msg.telegram.chatId = configuredChatId;
              msg.telegram.callbackQueryId = callbackQueryId;
              msg.telegram.autoAnswerCallback = node.autoAnswerCallback;

              // Continue with the original message
              var outPorts = ports.slice(0);
              var outputPort = parseInt(botMsg.data);

              if (!isNaN(outputPort) && outputPort < portCount) {
                outPorts[outputPort] = msg;
                node.send(outPorts);
              } else {
                node.warn("invalid callback data received from telegram");
              }
            } else {
              node.warn(`received callback in ${chatId} from '${username}/${userId}' was unauthorized`);
            }
          } else {
            // This is not the listener you are looking for
          }
        };

        var timeoutListener = function(sentMsg){
          utils.updateNodeStatus(node, "yellow", "dot", "timed out waiting for reply");

          // Remove this listener
          node.telegramBot.removeListener("callback_query", listener);

          var messageId = sentMsg.message_id;
          var chatId = sentMsg.chat.id;

          // Remove reply keyboard from message
          if (messageId && chatId) {
            node.telegramBot.editMessageReplyMarkup("{}", { chat_id: chatId, message_id: messageId }).then(function(sent){
              // nothing to do here
              console.log(" -switch- timeout sent (for editMessageReplyMarkup) = ", sent);
            });
          }

          // output to timeout
          var outPorts = ports.slice(0);
          var outputPort = portCount - 1;
          outPorts[outputPort] = msg;
          node.send(outPorts);
        };

        var sentListener = function(sent) {
          // Store sent message so we know how to respond later
          console.log(" -switch- sent = ", sent);
          msg.telegram = { messageId: sent.message_id };

          if (node.timeoutDuration > 0) {
            node.timeoutCallback = setTimeout(function(){
                timeoutListener(sent);
            }, node.timeoutDuration);
            utils.updateNodeStatusPending(node, `waiting for reply (${node.timeoutValue}${node.timeoutUnits})`);
          } else {
            utils.updateNodeStatusPending(node, "waiting for reply");
          }
        };

        var chunkSize = 4000;
        var answerOpts = answers.map(function(answer, idx){
          return { text: answer, callback_data: idx };
        });

        var splitOptsInRows = this.rowSize && this.rowSize > 0;
        var options = {
          reply_markup: {
            inline_keyboard: splitOptsInRows ? utils.chunkArray(answerOpts, this.rowSize) : [answerOpts]
          },
        };

        if (question.length > chunkSize) {
          utils.updateNodeStatusFailed(node, "message larger than allowed chunk size");
        } else if (alterMessageFromPreviousNode) {
          options.chat_id = configuredChatId;
          options.message_id = msg.telegram.messageId;
          node.telegramBot.editMessageText(question, options).then(sentListener);
          node.telegramBot.editMessageReplyMarkup(options.reply_markup, options).then(sentListener);
          node.telegramBot.on("callback_query", listener);
        } else {
          node.telegramBot.sendMessage(configuredChatId, question, options).then(sentListener);
          node.telegramBot.on("callback_query", listener);
        }
      }
    });

    this.on("close", function(){
      node.telegramBot.off("message");
      node.status({});
    });
  };

  RED.nodes.registerType("telegrambot-switch", SwitchNode);
};
