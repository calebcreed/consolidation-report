export interface TemplateRef {
    type: 'component' | 'directive' | 'pipe';
    name: string;
}
export declare function parseTemplate(templateContent: string): TemplateRef[];
