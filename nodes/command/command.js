var utils = require('../../lib/utils.js');

module.exports = function(RED) {
  function CommandNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    // Get base configuration
    this.bot = RED.nodes.getNode(config.bot);
    this.command = { type: config.commandType || "str", value: config.command, case: config.commandCase };

    // Initialize bot
    utils.initializeBot(node);

    // Verify inputs
    if (isEmpty(this.command.value)) {
      utils.updateNodeStatusFailed(node, "command is not provided");
      return;
    }

    if (this.command.type === "re") {
      try {
        this.command.value = new RegExp(this.command.value, this.command.case ? "" : "i");
      } catch(ex) {
        utils.updateNodeStatusFailed(node, "command is not valid regexp");
        node.warn(ex.message);
        return;
      }
    }

    if (node.telegramBot) {
      node.telegramBot.on('message', function(botMsg){
        console.log(' -command- botMsg', botMsg);
        var chatId = botMsg.chat.id;
        var username = botMsg.from.username;
        var userId = botMsg.from.id;
        var messageId = botMsg.message_id;
        console.log(' -command- chatId: ' + chatId);
        console.log(' -command- messageId: ' + messageId);
        var msg = {
          payload: botMsg,
          telegram: { chatId: chatId, messageId: messageId }
        };

        if (node.bot.isAuthorized(chatId, userId, username)) {
          if (matchedCommand(node.command, botMsg.text)) {
            node.send(msg);
          }
        } else {
          node.warn(`received unauthorized message in ${chatId} from '${username}/${userId}'`);
        }
      });
    }

    this.on("close", function(){
      node.telegramBot.off("message");
      node.status({});
    });
  }

  function matchedCommand(command, message) {
    if (command.type === "str" && !command.case) {
      return command.value.localeCompare(message, undefined, { sensitivity: "base" }) === 0;
    } else if (command.type === "str" && command.case) {
      return command.value === message;
    } else if (command.type === "re") {
      return command.value.test(message);
    } else {
      return false;
    }
  }

  function isEmpty(str) {
    return (!str || /^\s*$/.test(str));
  }

  RED.nodes.registerType("telegrambot-command", CommandNode);
};
