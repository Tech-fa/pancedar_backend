import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { CostService } from "../cost/cost.service";

export interface UnsubscribeResult {
  success: boolean;
  message: string;
  stepsExecuted: number;
}

interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  /** Tokens served from the provider's prompt cache */
  cacheHitTokens: number;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private configService: ConfigService,
    private costService: CostService,
  ) {}

  /**
   * Sends a user prompt to the configured chat completion API and returns the assistant text.
   * Pass `teamId` (and optionally `workflowRunId`) in options to have the token usage and
   * cost automatically persisted to the cost module.
   */
  async completeUserPrompt(
    prompt: string,
    options?: {
      maxTokens?: number;
      /** Required to persist cost records */
      teamId?: string;
      workflowRunId?: string | null;
    },
  ): Promise<string> {
    const url = this.configService.get<string>("LLM_API_URL");
    const apiKey = this.configService.get<string>("LLM_API_KEY");
    const model = this.configService.get<string>("LLM_MODEL") ?? "gpt-4o-mini";

    if (!url?.trim()) {
      throw new Error("LLM_API_URL is not configured");
    }
    if (!apiKey?.trim()) {
      throw new Error("LLM_API_KEY is not configured");
    }

    const maxTokens = options?.maxTokens ?? 1024;

    try {
      const { data } = await axios.post<unknown>(
        url,
        {
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 120_000,
        },
      );

      const text = this.extractLlmAssistantText(data);
      const promise = new Promise(async (resolve, reject) => {
        const usage = this.extractLlmUsage(data);
        console.log("usage", usage);
        if (options?.teamId && usage) {
          try {
            await this.costService.recordLlmCost({
              teamId: options.teamId,
              workflowRunId: options.workflowRunId ?? null,
              llmModelName: model,
              llmModelTokensInput: usage.promptTokens,
              llmModelTokensOutput: usage.completionTokens,
              llmModelTokensCacheHit: usage.cacheHitTokens,
            });
            resolve("");
          } catch (err) {
            this.logger.error("Failed to record LLM cost", err);
            reject(err);
          }
        }
      });
      promise
        .then(() => {})
        .catch((err) => {
          this.logger.error("Failed to record LLM cost", err);
        });
      return text;
    } catch (error) {
      this.logger.error("Error calling LLM API:", error);
      throw error;
    }
  }

  /**
   * Extracts token usage from an OpenAI-style response.
   * The API returns this for free – no extra computation needed.
   *
   * Cache-hit tokens are read from (in priority order):
   *   1. usage.prompt_cache_hit_tokens        – some proxies / DeepSeek style
   *   2. usage.prompt_tokens_details.cached_tokens – OpenAI native
   */
  private extractLlmUsage(data: unknown): LlmUsage | null {
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    const usage = d.usage;
    if (!usage || typeof usage !== "object") return null;
    const u = usage as Record<string, unknown>;
    const promptTokens =
      typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
    const completionTokens =
      typeof u.completion_tokens === "number" ? u.completion_tokens : 0;

    // Resolve cache hit tokens from whichever field the provider returns
    let cacheHitTokens = 0;
    if (typeof u.prompt_cache_hit_tokens === "number") {
      cacheHitTokens = u.prompt_cache_hit_tokens;
    } else if (
      u.prompt_tokens_details &&
      typeof u.prompt_tokens_details === "object"
    ) {
      const details = u.prompt_tokens_details as Record<string, unknown>;
      if (typeof details.cached_tokens === "number") {
        cacheHitTokens = details.cached_tokens;
      }
    }
    if (promptTokens === 0 && completionTokens === 0) return null;
    return { promptTokens, completionTokens, cacheHitTokens };
  }

  /** Supports OpenAI-style chat completions and common proxy shapes. */
  private extractLlmAssistantText(data: unknown): string {
    if (!data || typeof data !== "object") {
      return "";
    }
    const d = data as Record<string, unknown>;

    const choices = d.choices;
    if (
      Array.isArray(choices) &&
      choices[0] &&
      typeof choices[0] === "object"
    ) {
      const c0 = choices[0] as Record<string, unknown>;
      const msg = c0.message;
      if (msg && typeof msg === "object") {
        const content = (msg as Record<string, unknown>).content;
        if (typeof content === "string") {
          return content;
        }
      }
      if (typeof c0.text === "string") {
        return c0.text;
      }
    }

    const content = d.content;
    if (
      Array.isArray(content) &&
      content[0] &&
      typeof content[0] === "object"
    ) {
      const b0 = content[0] as Record<string, unknown>;
      if (typeof b0.text === "string") {
        return b0.text;
      }
    }

    if (typeof d.text === "string") {
      return d.text;
    }
    if (typeof d.response === "string") {
      return d.response;
    }
    return "";
  }

  async executeUnsubscribe(
    htmlContent: string,
    subject: string,
    fromEmail: string,
  ): Promise<void> {
    //     const MAX_STEPS = 15;
    //     let stepsExecuted = 0;
    //     let browser: Browser | null = null;
    //     let page: Page | null = null;
    //     const tools: Anthropic.Tool[] = [
    //       {
    //         name: 'navigate_to_url',
    //         description:
    //           'Navigate the browser to a URL. Use this to go to unsubscribe links. Returns the page content after navigation.',
    //         input_schema: {
    //           type: 'object' as const,
    //           properties: {
    //             url: {
    //               type: 'string',
    //               description: 'The URL to navigate to',
    //             },
    //           },
    //           required: ['url'],
    //         },
    //       },
    //       {
    //         name: 'click_element',
    //         description:
    //           'Click an element on the page (button, link, span, div, etc.). Use CSS selectors or text content to identify the element.',
    //         input_schema: {
    //           type: 'object' as const,
    //           properties: {
    //             selector: {
    //               type: 'string',
    //               description:
    //                 'CSS selector for the element (e.g., "button.unsubscribe", "#confirm-btn", "a[href*=unsubscribe]")',
    //             },
    //             text: {
    //               type: 'string',
    //               description:
    //                 'Optional: Text content to match if selector matches multiple elements (e.g., "Unsubscribe", "Confirm")',
    //             },
    //           },
    //           required: ['selector'],
    //         },
    //       },
    //       {
    //         name: 'check_checkbox',
    //         description:
    //           'Check or uncheck a checkbox on the page. Use this when you need to select options before unsubscribing.',
    //         input_schema: {
    //           type: 'object' as const,
    //           properties: {
    //             selector: {
    //               type: 'string',
    //               description:
    //                 'CSS selector for the checkbox (e.g., "input[type=checkbox]", "#unsubscribe-all")',
    //             },
    //             checked: {
    //               type: 'boolean',
    //               description: 'Whether to check (true) or uncheck (false) the checkbox',
    //             },
    //           },
    //           required: ['selector', 'checked'],
    //         },
    //       },
    //       {
    //         name: 'fill_input',
    //         description:
    //           'Fill a text input field on the page. Use this for email confirmation fields or other required inputs.',
    //         input_schema: {
    //           type: 'object' as const,
    //           properties: {
    //             selector: {
    //               type: 'string',
    //               description:
    //                 'CSS selector for the input field (e.g., "input[name=email]", "#email-confirm")',
    //             },
    //             value: {
    //               type: 'string',
    //               description: 'The value to enter into the field',
    //             },
    //           },
    //           required: ['selector', 'value'],
    //         },
    //       },
    //       {
    //         name: 'select_option',
    //         description:
    //           'Select an option from a <select> dropdown element. Use this instead of click_element for dropdown menus.',
    //         input_schema: {
    //           type: 'object' as const,
    //           properties: {
    //             selector: {
    //               type: 'string',
    //               description:
    //                 'CSS selector for the <select> element (e.g., "select[name=frequency]", "#email-preferences")',
    //             },
    //             value: {
    //               type: 'string',
    //               description:
    //                 'The value attribute of the option to select. If not known, use the label parameter instead.',
    //             },
    //             label: {
    //               type: 'string',
    //               description:
    //                 'The visible text of the option to select. Use this when you do not know the value attribute.',
    //             },
    //           },
    //           required: ['selector'],
    //         },
    //       },
    //       {
    //         name: 'get_page_content',
    //         description:
    //           'Get the current page content and visible text. Use this to understand the current state of the page.',
    //         input_schema: {
    //           type: 'object' as const,
    //           properties: {},
    //           required: [],
    //         },
    //       },
    //       {
    //         name: 'complete_unsubscribe',
    //         description:
    //           'Call this when the unsubscribe process is complete or when you determine it cannot be completed automatically.',
    //         input_schema: {
    //           type: 'object' as const,
    //           properties: {
    //             success: {
    //               type: 'boolean',
    //               description: 'Whether the unsubscribe was successful',
    //             },
    //             message: {
    //               type: 'string',
    //               description: 'A message describing the outcome',
    //             },
    //           },
    //           required: ['success', 'message'],
    //         },
    //       },
    //     ];
    //     const systemPrompt = `You are an unsubscribe agent with browser automation capabilities. Your job is to help users unsubscribe from email newsletters.
    // You will be given the HTML content of an email. Your task is to:
    // 1. Find the unsubscribe link in the email HTML
    // 2. Use navigate_to_url to go to that link
    // 3. Analyze the page content and interact with it as needed:
    //    - Use click_element to click buttons, links, or other clickable elements
    //    - Use check_checkbox to check/uncheck checkboxes (e.g., "unsubscribe from all")
    //    - Use fill_input to fill in email confirmation fields or other inputs
    //    - Use get_page_content to see the current state of the page after actions
    // 4. Call complete_unsubscribe when done
    // Important guidelines:
    // - Look for links containing "unsubscribe", "opt-out", "preferences", or similar terms in the email HTML
    // - Extract the complete URL including all query parameters
    // - After navigating to the unsubscribe page, look for:
    //   - Confirmation buttons (e.g., "Confirm", "Unsubscribe", "Yes, unsubscribe me")
    //   - Checkboxes that need to be checked/unchecked
    //   - Email confirmation fields that need to be filled
    //   - Dropdown/select menus for preferences (use select_option tool for these)
    // - Use CSS selectors to identify elements. Common patterns:
    //   - Buttons: "button", "input[type=submit]", "a.btn", "[role=button]"
    //   - Checkboxes: "input[type=checkbox]"
    //   - Links: "a[href*=unsubscribe]", "a:contains('unsubscribe')"
    //   - Dropdowns: "select", "select[name=...]"
    // - IMPORTANT: For <select> dropdown elements, use the select_option tool, NOT click_element. Clicking <option> elements directly will fail.
    // - If a selector matches multiple elements, use the text parameter to narrow down
    // - Look for success messages like "successfully unsubscribed", "removed from list", etc.
    // - If you cannot find an unsubscribe link or the process fails, call complete_unsubscribe with success=false
    // - Maximum ${MAX_STEPS} steps allowed`;
    //     const initialPrompt = `Please unsubscribe me from this email:
    // From: ${fromEmail}
    // Subject: ${subject}
    // Email HTML Content:
    // ${htmlContent}
    // Find the unsubscribe link and follow it to complete the unsubscription.`;
    //     const messages: Anthropic.MessageParam[] = [
    //       { role: 'user', content: initialPrompt },
    //     ];
    //     try {
    //       // Launch headless browser
    //       browser = await puppeteer.launch({
    //         headless: true,
    //         args: [
    //           '--no-sandbox',
    //           '--disable-setuid-sandbox',
    //           '--disable-dev-shm-usage',
    //           '--disable-gpu',
    //         ],
    //       });
    //       page = await browser.newPage();
    //       // Set a realistic user agent
    //       await page.setUserAgent(
    //         'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    //       );
    //       // Set viewport
    //       await page.setViewport({ width: 1280, height: 800 });
    //       while (stepsExecuted < MAX_STEPS) {
    //         const response = await this.client.messages.create({
    //           model: 'claude-sonnet-4-20250514',
    //           max_tokens: 4096,
    //           system: systemPrompt,
    //           tools,
    //           messages,
    //         });
    //         stepsExecuted++;
    //         // Check if we need to process tool calls
    //         if (response.stop_reason === 'tool_use') {
    //           const assistantContent = response.content;
    //           messages.push({ role: 'assistant', content: assistantContent });
    //           const toolResults: Anthropic.ToolResultBlockParam[] = [];
    //           for (const block of assistantContent) {
    //             if (block.type === 'tool_use') {
    //               // Check if this is the completion tool
    //               if (block.name === 'complete_unsubscribe') {
    //                 const input = block.input as {
    //                   success: boolean;
    //                   message: string;
    //                 };
    //                 return {
    //                   success: input.success,
    //                   message: input.message,
    //                   stepsExecuted,
    //                 };
    //               }
    //               const toolResult = await this.executeBrowserTool(
    //                 page,
    //                 block.name,
    //                 block.input as Record<string, unknown>,
    //                 fromEmail,
    //               );
    //               toolResults.push({
    //                 type: 'tool_result',
    //                 tool_use_id: block.id,
    //                 content: toolResult,
    //               });
    //             }
    //           }
    //           messages.push({ role: 'user', content: toolResults });
    //         } else {
    //           // Model stopped without calling complete_unsubscribe
    //           this.logger.warn('Model stopped without completing unsubscribe');
    //           return {
    //             success: false,
    //             message: 'Unsubscribe process did not complete normally',
    //             stepsExecuted,
    //           };
    //         }
    //       }
    //       // Max steps reached
    //       return {
    //         success: false,
    //         message: `Maximum steps (${MAX_STEPS}) reached without completing unsubscribe`,
    //         stepsExecuted,
    //       };
    //     } catch (error) {
    //       this.logger.error('Error during unsubscribe process:', error);
    //       return {
    //         success: false,
    //         message: `Error: ${error.message}`,
    //         stepsExecuted,
    //       };
    //     } finally {
    //       // Always close the browser
    //       if (browser) {
    //         await browser.close();
    //       }
    //     }
  }

  //   private async executeBrowserTool(
  //     page: Page,
  //     toolName: string,
  //     input: Record<string, unknown>,
  //     userEmail: string,
  //   ): Promise<string> {
  //     try {
  //       switch (toolName) {
  //         case 'navigate_to_url':
  //           return await this.navigateToUrl(page, input.url as string);

  //         case 'click_element':
  //           return await this.clickElement(
  //             page,
  //             input.selector as string,
  //             input.text as string | undefined,
  //           );

  //         case 'check_checkbox':
  //           return await this.checkCheckbox(
  //             page,
  //             input.selector as string,
  //             input.checked as boolean,
  //           );

  //         case 'fill_input':
  //           return await this.fillInput(
  //             page,
  //             input.selector as string,
  //             input.value as string,
  //             userEmail,
  //           );

  //         case 'select_option':
  //           return await this.selectOption(
  //             page,
  //             input.selector as string,
  //             input.value as string | undefined,
  //             input.label as string | undefined,
  //           );

  //         case 'get_page_content':
  //           return await this.getPageContent(page);

  //         default:
  //           return `Unknown tool: ${toolName}`;
  //       }
  //     } catch (error) {
  //       this.logger.error(`Error executing browser tool ${toolName}:`, error);
  //       return `Error: ${error.message}`;
  //     }
  //   }

  //   private async navigateToUrl(page: Page, url: string): Promise<string> {
  //     this.logger.log(`Navigating to URL: ${url}`);

  //     try {
  //       const response = await page.goto(url, {
  //         waitUntil: 'networkidle2',
  //         timeout: 30000,
  //       });

  //       const status = response?.status() || 'unknown';
  //       const finalUrl = page.url();

  //       // Get page content
  //       const content = await this.getPageContent(page);

  //       return `Navigation successful
  // Status: ${status}
  // Final URL: ${finalUrl}

  // Page Content:
  // ${content}`;
  //     } catch (error) {
  //       this.logger.error(`Error navigating to ${url}:`, error);
  //       return `Error navigating to URL: ${error.message}`;
  //     }
  //   }

  //   private async clickElement(
  //     page: Page,
  //     selector: string,
  //     text?: string,
  //   ): Promise<string> {
  //     this.logger.log(`Clicking element: ${selector}${text ? ` with text "${text}"` : ''}`);

  //     try {
  //       // Wait for the selector to be present
  //       await page.waitForSelector(selector, { timeout: 10000 });

  //       if (text) {
  //         // Find elements matching selector and filter by text
  //         const elements = await page.$$(selector);
  //         let clicked = false;

  //         for (const element of elements) {
  //           const elementText = await element.evaluate((el) => el.textContent || '');
  //           if (elementText.toLowerCase().includes(text.toLowerCase())) {
  //             await element.click();
  //             clicked = true;
  //             break;
  //           }
  //         }

  //         if (!clicked) {
  //           return `Error: No element matching selector "${selector}" with text "${text}" found`;
  //         }
  //       } else {
  //         await page.click(selector);
  //       }

  //       // Wait for any navigation or network activity
  //       await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {
  //         // Ignore timeout - page might not have network activity
  //       });

  //       // Get updated page content
  //       const content = await this.getPageContent(page);

  //       return `Clicked element successfully
  // Current URL: ${page.url()}

  // Page Content:
  // ${content}`;
  //     } catch (error) {
  //       this.logger.error(`Error clicking element ${selector}:`, error);
  //       return `Error clicking element: ${error.message}`;
  //     }
  //   }

  //   private async checkCheckbox(
  //     page: Page,
  //     selector: string,
  //     checked: boolean,
  //   ): Promise<string> {
  //     this.logger.log(`${checked ? 'Checking' : 'Unchecking'} checkbox: ${selector}`);

  //     try {
  //       await page.waitForSelector(selector, { timeout: 10000 });

  //       const isCurrentlyChecked = await page.$eval(
  //         selector,
  //         (el: HTMLInputElement) => el.checked,
  //       );

  //       if (isCurrentlyChecked !== checked) {
  //         await page.click(selector);
  //       }

  //       const newState = await page.$eval(
  //         selector,
  //         (el: HTMLInputElement) => el.checked,
  //       );

  //       return `Checkbox ${checked ? 'checked' : 'unchecked'} successfully
  // Current state: ${newState ? 'checked' : 'unchecked'}`;
  //     } catch (error) {
  //       this.logger.error(`Error with checkbox ${selector}:`, error);
  //       return `Error with checkbox: ${error.message}`;
  //     }
  //   }

  //   private async fillInput(
  //     page: Page,
  //     selector: string,
  //     value: string,
  //     userEmail: string,
  //   ): Promise<string> {
  //     this.logger.log(`Filling input: ${selector}`);

  //     try {
  //       await page.waitForSelector(selector, { timeout: 10000 });

  //       // Clear existing value
  //       await page.$eval(selector, (el: HTMLInputElement) => {
  //         el.value = '';
  //       });

  //       // If the value contains placeholder for email, replace with actual email
  //       const actualValue = value.replace(/\{email\}|\{user_email\}/gi, userEmail);

  //       await page.type(selector, actualValue);

  //       return `Input filled successfully with: ${actualValue}`;
  //     } catch (error) {
  //       this.logger.error(`Error filling input ${selector}:`, error);
  //       return `Error filling input: ${error.message}`;
  //     }
  //   }

  //   private async selectOption(
  //     page: Page,
  //     selector: string,
  //     value?: string,
  //     label?: string,
  //   ): Promise<string> {
  //     this.logger.log(
  //       `Selecting option from ${selector}: value="${value || ''}" label="${label || ''}"`,
  //     );

  //     try {
  //       await page.waitForSelector(selector, { timeout: 10000 });

  //       let selectedValue: string[];

  //       if (value) {
  //         // Select by value attribute
  //         selectedValue = await page.select(selector, value);
  //       } else if (label) {
  //         // Select by visible text - need to find the value first
  //         const optionValue = await page.$eval(
  //           selector,
  //           (select: HTMLSelectElement, labelText: string) => {
  //             const options = Array.from(select.options);
  //             const option = options.find(
  //               (opt) =>
  //                 opt.text.toLowerCase().includes(labelText.toLowerCase()) ||
  //                 opt.textContent?.toLowerCase().includes(labelText.toLowerCase()),
  //             );
  //             return option?.value || null;
  //           },
  //           label,
  //         );

  //         if (!optionValue) {
  //           // List available options for debugging
  //           const availableOptions = await page.$eval(
  //             selector,
  //             (select: HTMLSelectElement) => {
  //               return Array.from(select.options).map(
  //                 (opt) => `"${opt.text}" (value: ${opt.value})`,
  //               );
  //             },
  //           );
  //           return `Error: No option with label containing "${label}" found.\nAvailable options: ${availableOptions.join(', ')}`;
  //         }

  //         selectedValue = await page.select(selector, optionValue);
  //       } else {
  //         return 'Error: Either value or label must be provided';
  //       }

  //       // Get the selected option text for confirmation
  //       const selectedText = await page.$eval(
  //         selector,
  //         (select: HTMLSelectElement) => {
  //           const selectedOption = select.options[select.selectedIndex];
  //           return selectedOption ? selectedOption.text : 'unknown';
  //         },
  //       );

  //       return `Option selected successfully\nSelected: "${selectedText}" (value: ${selectedValue.join(', ')})`;
  //     } catch (error) {
  //       this.logger.error(`Error selecting option from ${selector}:`, error);
  //       return `Error selecting option: ${error.message}`;
  //     }
  //   }

  //   private async getPageContent(page: Page): Promise<string> {
  //     try {
  //       // Get visible text content
  //       const textContent = await page.evaluate(() => {
  //         const getText = (element: Element): string => {
  //           if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') {
  //             return '';
  //           }

  //           let text = '';
  //           Array.from(element.childNodes).forEach((child) => {
  //             if (child.nodeType === Node.TEXT_NODE) {
  //               text += child.textContent?.trim() + ' ';
  //             } else if (child.nodeType === Node.ELEMENT_NODE) {
  //               text += getText(child as Element);
  //             }
  //           });
  //           return text;
  //         };

  //         return getText(document.body);
  //       });

  //       // Get interactive elements for context
  //       const interactiveElements = await page.evaluate(() => {
  //         const elements: string[] = [];

  //         // Buttons
  //         document.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach((el) => {
  //           const text = el.textContent?.trim() || (el as HTMLInputElement).value || '';
  //           const id = el.id ? `#${el.id}` : '';
  //           const classes = el.className ? `.${el.className.split(' ').join('.')}` : '';
  //           if (text) {
  //             elements.push(`Button: "${text}" (selector: ${el.tagName.toLowerCase()}${id}${classes})`);
  //           }
  //         });

  //         // Links with unsubscribe-related text
  //         document.querySelectorAll('a').forEach((el) => {
  //           const text = el.textContent?.trim() || '';
  //           const href = el.href || '';
  //           if (
  //             text.toLowerCase().includes('unsubscribe') ||
  //             text.toLowerCase().includes('confirm') ||
  //             text.toLowerCase().includes('opt') ||
  //             href.toLowerCase().includes('unsubscribe')
  //           ) {
  //             elements.push(`Link: "${text}" (href: ${href})`);
  //           }
  //         });

  //         // Checkboxes
  //         document.querySelectorAll('input[type="checkbox"]').forEach((el) => {
  //           const id = el.id ? `#${el.id}` : '';
  //           const name = (el as HTMLInputElement).name ? `[name="${(el as HTMLInputElement).name}"]` : '';
  //           const label = el.id
  //             ? document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()
  //             : '';
  //           const checked = (el as HTMLInputElement).checked ? 'checked' : 'unchecked';
  //           elements.push(`Checkbox: "${label || 'unnamed'}" (${checked}, selector: input[type="checkbox"]${id}${name})`);
  //         });

  //         // Text inputs
  //         document.querySelectorAll('input[type="text"], input[type="email"]').forEach((el) => {
  //           const id = el.id ? `#${el.id}` : '';
  //           const name = (el as HTMLInputElement).name ? `[name="${(el as HTMLInputElement).name}"]` : '';
  //           const placeholder = (el as HTMLInputElement).placeholder || '';
  //           elements.push(`Input: "${placeholder || 'text field'}" (selector: input${id}${name})`);
  //         });

  //         // Select dropdowns
  //         document.querySelectorAll('select').forEach((el) => {
  //           const select = el as HTMLSelectElement;
  //           const id = el.id ? `#${el.id}` : '';
  //           const name = select.name ? `[name="${select.name}"]` : '';
  //           const options = Array.from(select.options).map((opt) => `"${opt.text}"`).slice(0, 5);
  //           const moreOptions = select.options.length > 5 ? ` +${select.options.length - 5} more` : '';
  //           const selectedOption = select.options[select.selectedIndex];
  //           const selectedText = selectedOption ? selectedOption.text : 'none';
  //           elements.push(`Select: options=[${options.join(', ')}${moreOptions}] selected="${selectedText}" (selector: select${id}${name})`);
  //         });

  //         return elements;
  //       });

  //       // Truncate content if too long
  //       const maxLength = 6000;
  //       const truncatedText =
  //         textContent.length > maxLength
  //           ? textContent.substring(0, maxLength) + '...'
  //           : textContent;

  //       return `Visible Text:
  // ${truncatedText}

  // Interactive Elements:
  // ${interactiveElements.join('\n')}`;
  //     } catch (error) {
  //       this.logger.error('Error getting page content:', error);
  //       return `Error getting page content: ${error.message}`;
  //     }
  //   }
}
