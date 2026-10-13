import { IsDateString, IsEnum, IsString } from "class-validator";
import { CredentialScope } from "../../generated/prisma/enums.js";

export class CreateCredentialDTO {
    // i am intentionally putting a minimal property set in this
    // class to see how bad it is so yeah

    @IsEnum(CredentialScope)
    scope!: CredentialScope;

    @IsString()
    name: string

    @IsDateString()
    expiresAt: string
}