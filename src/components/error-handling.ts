import { CommandInteraction, MessageFlags } from "discord.js"
import { ILogger } from "@sapphire/framework"

export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserError"
  }
}

export async function handleInteractionErrors<T>(
  interaction: CommandInteraction,
  logger: ILogger,
  fn: () => Promise<T> | T,
  onSuccess?: (result: T) => Promise<unknown> | void,
): Promise<void> {
  try {
    const result = await fn()
    await onSuccess?.(result)
  } catch (error) {
    if (error instanceof UserError) {
      await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral })
      return
    }
    logger.error("Unexpected error in command:", error)
    await interaction.reply({
      content: "An unexpected error occurred! Please report this to the admins/dev.",
      flags: MessageFlags.Ephemeral,
    })
    return
  }
}

export function maybeUserError(message: string | undefined): void {
  if (message) {
    throw new UserError(message)
  }
}
