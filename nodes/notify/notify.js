var utils = require('../../lib/utils.js');

module.exports = function(RED) {
  function NotifyNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    // Get base configuration
    this.bot = RED.nodes.getNode(config.bot);
    this.chatId = parseInt(config.chatId);
    this.parseMode = config.parseMode;
    this.staticMessage = config.message;

    // Initialize bot
    utils.initializeBot(node);

    this.on("input", function(msg){
      if (!(node.staticMessage || msg.payload)) {
        utils.updateNodeStatusFailed(node, "message payload is empty");
        return;
      }

      var message = node.staticMessage || msg.payload;
      var chunkSize = 4000;
      var done = false;
      var messageToSend;
      var options = { parse_mode: node.parseMode };

      var firstMessage = true;
      do {
        if (message.length > chunkSize) {
          messageToSend = message.substr(0, chunkSize);
          message = message.substr(chunkSize);
        } else {
          messageToSend = message;
          done = true;
        }
        var chatId = node.bot.findChatId(node.chatId, msg.telegram);

        var sentListener = function (sent) {
            msg.telegram = {sentMessageId: sent.message_id};
            node.send(msg);
        };

        var messageIsMarkupAnswer = msg.telegram && msg.telegram.autoAnswerCallback && msg.telegram.callbackQueryId;
        var alterMessageFromPreviousNode = firstMessage && !node.chatId && messageIsMarkupAnswer;
        if (alterMessageFromPreviousNode) {
            options.reply_markup = {};
            options.chat_id = chatId;
            options.message_id = msg.telegram.messageId;
            node.telegramBot.editMessageText(messageToSend, options).then(sentListener);
        } else {
          node.telegramBot.sendMessage(chatId, messageToSend, options).then(sentListener);
        }

        firstMessage = false;
      } while (!done);
    });

    this.on("close", function(){
      node.telegramBot.off("message");
      node.status({});
    });
  }

  RED.nodes.registerType("telegrambot-notify", NotifyNode);
};
