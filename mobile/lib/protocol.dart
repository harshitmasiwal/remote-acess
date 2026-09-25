class CommandMessage {
  const CommandMessage({
    required this.id,
    required this.command,
    required this.payload,
  });

  final String id;
  final String command;
  final Map<String, dynamic> payload;

  factory CommandMessage.fromJson(Map<String, dynamic> json) {
    return CommandMessage(
      id: json['id'] as String,
      command: json['command'] as String,
      payload: Map<String, dynamic>.from(json['payload'] as Map? ?? const {}),
    );
  }
}
