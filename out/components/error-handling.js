import { MessageFlags } from "discord.js";
export class UserError extends Error {
    constructor(message) {
        super(message);
        this.name = "UserError";
    }
}
export async function handleInteractionErrors(interaction, logger, fn, onSuccess) {
    try {
        const result = await fn();
        await onSuccess?.(result);
    }
    catch (error) {
        if (error instanceof UserError) {
            await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
            return;
        }
        logger.error("Unexpected error:", error);
        await interaction.reply({
            content: "An unexpected error occurred! Please report this to the admins/dev.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
}
export function maybeUserError(message) {
    if (message) {
        throw new UserError(message);
    }
}
export function userError(message) {
    throw new UserError(message);
}
//# sourceMappingURL=error-handling.js.map