import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { RegisterDto } from './dto/register.dto.js';
import { SignInDto } from './dto/signin.dto.js';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ access_token: string }> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: { email: dto.email, passwordHash },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }

    return { access_token: await this.signToken(user.id) };
  }

  async login(dto: SignInDto): Promise<{ access_token: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    const invalidCredentials = () => new UnauthorizedException('Invalid credentials');

    if (!user) {
      throw invalidCredentials();
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw invalidCredentials();
    }

    return { access_token: await this.signToken(user.id) };
  }

  private signToken(userId: string): Promise<string> {
    return this.jwtService.signAsync({ sub: userId });
  }
}
