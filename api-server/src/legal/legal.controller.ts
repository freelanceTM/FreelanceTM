import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';

@ApiTags('Legal')
@Controller()
export class LegalController {
  private tosContent: string;
  private privacyContent: string;

  constructor() {
    // Serve markdown content as plain text (frontend can render)
    try {
      this.tosContent = readFileSync(join(process.cwd(), '..', 'docs', 'TOS.md'), 'utf-8');
    } catch {
      this.tosContent = '# Terms of Service\n\nPlease visit https://freelancetm.io/terms for full terms.';
    }
    try {
      this.privacyContent = readFileSync(join(process.cwd(), '..', 'docs', 'PRIVACY.md'), 'utf-8');
    } catch {
      this.privacyContent = '# Privacy Policy\n\nPlease visit https://freelancetm.io/privacy for full policy.';
    }
  }

  @Get('terms')
  @ApiOperation({ summary: 'Terms of Service', description: 'Returns plain text markdown of Terms of Service' })
  getTerms(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(this.tosContent);
  }

  @Get('privacy')
  @ApiOperation({ summary: 'Privacy Policy', description: 'Returns plain text markdown of Privacy Policy' })
  getPrivacy(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(this.privacyContent);
  }
}
