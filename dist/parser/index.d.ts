import { FileNode } from '../config';
import { TemplateRef } from './template';
import { NgRxPatterns } from './ngrx';
export interface ParsedFile {
    filePath: string;
    relativePath: string;
    className?: string;
    type: FileNode['type'];
    selector?: string;
    providedIn?: string;
    imports: string[];
    ngModuleImports: string[];
    ngModuleDeclarations: string[];
    ngModuleExports: string[];
    ngModuleProviders: string[];
    componentProviders: string[];
    constructorInjections: string[];
    templateRefs: TemplateRef[];
    ngrx?: NgRxPatterns;
    ngrxFileType?: 'action' | 'reducer' | 'effect' | 'selector' | 'state' | null;
}
export declare class AngularParser {
    private project;
    private baseDir;
    constructor(baseDir: string);
    parseDirectory(dirPath: string, extensions?: string[], showProgress?: boolean): ParsedFile[];
    private collectFiles;
    parseFile(filePath: string): ParsedFile | null;
    private parseImports;
    private parseComponentDecorator;
    private parseNgModuleDecorator;
    private parseInjectableDecorator;
    private parseDirectiveDecorator;
    private parsePipeDecorator;
    private parseConstructorInjections;
    private parseArrayOfIdentifiers;
    private inferTypeFromFilename;
}
export { parseTemplate, TemplateRef } from './template';
