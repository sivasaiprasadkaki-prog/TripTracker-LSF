import { Component, ChangeDetectionStrategy, input, output, signal, inject, computed, OnInit, effect } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Ledger, Entry } from './app.component';

interface EntryWithBalance extends Entry {
  balance: number;
}

// Make TypeScript aware of the global variables from the CDN scripts
declare var XLSX: any;
declare var jsPDF: any;

// Sample data to be used for the preview generation
const samplePreviewEntries: Entry[] = [
  {
    id: '1719331800000',
    type: 'cash-out',
    date: '2024-06-25',
    time: '12:30',
    details: 'Lunch at University Cafeteria',
    category: 'Food',
    mode: 'UPI',
    amount: 150,
    attachments: [
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAFoAUADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwD2UAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//2Q==',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    ],
    notes: 'Paneer Butter Masala and Naan.'
  },
  {
    id: '1719418200000',
    type: 'cash-in',
    date: '2024-06-26',
    time: '11:00',
    details: 'Advance from Parents',
    category: 'Advance',
    mode: 'Bank Transfer',
    amount: 5000,
    attachments: [],
    notes: ''
  }
];


@Component({
  selector: 'app-ledger-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="font-sans flex flex-col h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 animate-fade-in">
      <!-- Header -->
      <header class="flex items-center justify-between p-4 flex-shrink-0 border-b border-slate-200 dark:border-slate-800">
        <div class="flex items-center space-x-4">
          <button (click)="close.emit()" class="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" aria-label="Back to home">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl sm:text-2xl font-bold truncate" [title]="ledger().name">{{ ledger().name }}</h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Created: {{ ledger().createdAt.toLocaleDateString() }}
            </p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
           <button (click)="exportToExcel()" [disabled]="isExportingExcel()" class="p-2 rounded-lg flex items-center justify-center space-x-2 text-sm bg-[#A6F4A6] dark:bg-green-800 text-black dark:text-slate-100 transition-all duration-250 ease-in-out hover:scale-105 hover:shadow-lg hover:shadow-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed w-24">
             @if (isExportingExcel()) {
                <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
             } @else {
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                 <path d="M3.5 2.75A.75.75 0 0 0 2.75 3.5v13.5c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75V8.268a.75.75 0 0 0-.22-.53l-4.268-4.268a.75.75 0 0 0-.53-.22H3.5ZM9.75 11.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" />
                 <path d="M13.25 2.5a.75.75 0 0 0-.75.75v3.5c0 .414.336.75.75.75h3.5a.75.75 0 0 0 .75-.75V6.25a.75.75 0 0 0-.22-.53l-2.25-2.25a.75.75 0 0 0-.53-.22h-1Z" />
               </svg>
               <span class="hidden sm:inline">Excel</span>
             }
          </button>
          <button (click)="exportToPdf()" [disabled]="isExportingPdf()" class="p-2 rounded-lg flex items-center justify-center space-x-2 text-sm bg-[#FFB3B3] dark:bg-red-800 text-black dark:text-slate-100 transition-all duration-250 ease-in-out hover:scale-105 hover:shadow-lg hover:shadow-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed w-24">
            @if (isExportingPdf()) {
               <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            } @else {
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                <path fill-rule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.633a.75.75 0 0 1-.22.53l-3.268 3.268a.75.75 0 0 1-.53.22H6.75A1.75 1.75 0 0 1 5 9.383V2.75ZM6.75 2.5a.25.25 0 0 0-.25.25v6.633c0 .138.112.25.25.25h2.433a.25.25 0 0 0 .177-.073l2.268-2.268a.25.25 0 0 0 .073-.177V2.75a.25.25 0 0 0-.25-.25h-4.5Z" clip-rule="evenodd" />
                <path d="M8.25 11.5a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z" />
                <path d="M3 8.75A1.75 1.75 0 0 1 4.75 7h10.5A1.75 1.75 0 0 1 17 8.75v8.5A1.75 1.75 0 0 1 15.25 19H4.75A1.75 1.75 0 0 1 3 17.25v-8.5ZM4.75 8.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H4.75Z" />
              </svg>
              <span class="hidden sm:inline">PDF</span>
            }
          </button>
        </div>
      </header>
      
      <!-- Main content -->
      <main class="flex-grow p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
          <div class="p-4 bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 rounded-lg">
            <h3 class="text-sm font-medium text-green-700 dark:text-green-300">Cash In</h3>
            <p class="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{{ cashInTotal() | number:'1.2-2' }}</p>
          </div>
           <div class="p-4 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 rounded-lg">
            <h3 class="text-sm font-medium text-red-700 dark:text-red-300">Cash Out</h3>
            <p class="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{{ cashOutTotal() | number:'1.2-2' }}</p>
          </div>
           <div class="p-4 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h3 class="text-sm font-medium text-blue-700 dark:text-blue-300">Balance</h3>
            <p class="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{{ balance() | number:'1.2-2' }}</p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center space-x-4 mb-6">
          <button (click)="openAddEntryModal('cash-in')" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-transform duration-200 hover:scale-105 flex items-center justify-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            <span>Add Cash In</span>
          </button>
          <button (click)="openAddEntryModal('cash-out')" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-transform duration-200 hover:scale-105 flex items-center justify-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
              <path fill-rule="evenodd" d="M4 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75A.75.75 0 0 1 4 10Z" clip-rule="evenodd" />
            </svg>
            <span>Add Cash Out</span>
          </button>
        </div>

        <!-- Entries Table -->
        @if (entriesWithBalance().length > 0) {
          <div class="bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700/50 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                <thead class="text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th scope="col" class="px-6 py-3">Date & Details</th>
                    <th scope="col" class="px-6 py-3 hidden md:table-cell">Category</th>
                    <th scope="col" class="px-6 py-3 hidden sm:table-cell">Mode</th>
                    <th scope="col" class="px-6 py-3 text-right">Amount</th>
                    <th scope="col" class="px-6 py-3 text-right">Balance</th>
                    <th scope="col" class="px-6 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (entry of entriesWithBalance(); track entry.id) {
                    <tr class="bg-white dark:bg-slate-800/50 border-b dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                      <td class="px-6 py-4">
                        <div class="font-medium text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                          <span>{{ entry.details }}</span>
                          @if(entry.attachments && entry.attachments.length > 0) {
                            <button (click)="openAttachmentViewer(entry.attachments)" class="text-slate-400 hover:text-indigo-500 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                                <path fill-rule="evenodd" d="M15.621 4.379a3 3 0 0 1 0 4.242l-5.657 5.657a3 3 0 0 1-4.242 0l-1.06-1.061a1.5 1.5 0 0 1 2.121-2.122l2.121-2.121a1.5 1.5 0 0 1 2.122 0l4.242 4.242a.75.75 0 0 0 1.06-1.06l-4.242-4.243a3 3 0 0 0-4.242 0L8.88 8.12a.75.75 0 0 0 1.06 1.06l1.06-1.06a1.5 1.5 0 0 1 2.122 0l1.06 1.061a1.5 1.5 0 0 1 0 2.122l-5.657 5.657a.75.75 0 1 1-1.06-1.06l5.657-5.657a1.5 1.5 0 0 0 0-2.121Z" clip-rule="evenodd" />
                              </svg>
                            </button>
                          }
                        </div>
                        <div class="text-xs">{{ entry.date | date:'mediumDate' }} {{ entry.time }}</div>
                      </td>
                      <td class="px-6 py-4 hidden md:table-cell">{{ entry.category }}</td>
                      <td class="px-6 py-4 hidden sm:table-cell">{{ entry.mode }}</td>
                      <td class="px-6 py-4 text-right font-mono" 
                          [class.text-green-600]="entry.type === 'cash-in'"
                          [class.dark:text-green-500]="entry.type === 'cash-in'"
                          [class.text-red-600]="entry.type === 'cash-out'"
                          [class.dark:text-red-500]="entry.type === 'cash-out'">
                        {{ entry.type === 'cash-in' ? '+' : '-' }}{{ entry.amount | number:'1.2-2' }}
                      </td>
                      <td class="px-6 py-4 text-right font-mono">{{ entry.balance | number:'1.2-2' }}</td>
                      <td class="px-6 py-4">
                        <div class="flex justify-center items-center space-x-2">
                           <button (click)="openEditEntryModal(entry)" class="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors" aria-label="Edit entry">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                                <path d="m2.695 14.762-1.262 3.155a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
                              </svg>
                           </button>
                           <button (click)="deleteEntry(entry)" class="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-red-500 dark:hover:text-red-400 transition-colors" aria-label="Delete entry">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                                <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" />
                              </svg>
                           </button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </main>
    </div>

    <!-- Add/Edit Entry Modal -->
    @if (isModalVisible()) {
      <div class="fixed inset-0 bg-black/60 flex items-start sm:items-center justify-center z-50 animate-fade-in-fast overflow-y-auto p-4" (click)="closeAddEntryModal()">
        <div (click)="$event.stopPropagation()" class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl my-8">
          <form [formGroup]="addEntryForm" (ngSubmit)="onSaveEntry()">
            <!-- Modal Header -->
            <div class="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
               <h2 class="text-xl sm:text-2xl font-bold text-center mb-4">{{ modalTitle() }}</h2>
               <div class="relative bg-slate-200 dark:bg-slate-700 p-1 rounded-lg grid grid-cols-2 font-semibold">
                  <div class="absolute h-full w-1/2 p-1 transition-transform duration-300 ease-in-out" 
                      [style.transform]="addEntryForm.value.type === 'cash-in' ? 'translateX(0%)' : 'translateX(100%)'">
                      <div class="bg-white dark:bg-slate-600 w-full h-full rounded-md shadow"></div>
                  </div>
                  <button type="button" (click)="addEntryForm.controls.type.setValue('cash-in')" class="relative z-10 py-2 text-center rounded-md" [class.text-green-600]="addEntryForm.value.type === 'cash-in'">Cash In</button>
                  <button type="button" (click)="addEntryForm.controls.type.setValue('cash-out')" class="relative z-10 py-2 text-center rounded-md" [class.text-red-600]="addEntryForm.value.type === 'cash-out'">Cash Out</button>
               </div>
            </div>

            <!-- Modal Body -->
            <div class="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 max-h-[60vh] overflow-y-auto">
              <!-- Date & Time -->
              <div class="sm:col-span-2 grid grid-cols-2 gap-6">
                <div>
                  <label for="date" class="block text-sm font-medium mb-1">Date</label>
                  <input id="date" type="date" formControlName="date" class="form-input">
                </div>
                <div>
                  <label for="time" class="block text-sm font-medium mb-1">Time</label>
                  <input id="time" type="time" formControlName="time" class="form-input">
                </div>
              </div>
              <!-- Details -->
              <div class="sm:col-span-2">
                <label for="details" class="block text-sm font-medium mb-1">Details</label>
                <input id="details" type="text" formControlName="details" placeholder="e.g., Lunch with team" class="form-input">
              </div>
              <!-- Category -->
              <div>
                <label for="category" class="block text-sm font-medium mb-1">Category</label>
                <select id="category" formControlName="category" class="form-input">
                  <option value="Food">Food</option>
                  <option value="Transport">Transport</option>
                  <option value="Advance">Advance</option>
                  <option value="Health Care">Health Care</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <!-- Custom Category Input (conditionally shown) -->
              @if(isCustomCategory()) {
                <div>
                  <label for="customCategory" class="block text-sm font-medium mb-1">Custom Category Name</label>
                  <input id="customCategory" type="text" formControlName="customCategory" placeholder="Enter category" class="form-input">
                </div>
              }
              <!-- Mode -->
               <div>
                <label for="mode" class="block text-sm font-medium mb-1">Mode</label>
                <input id="mode" type="text" formControlName="mode" placeholder="e.g., Cash, Card, UPI" class="form-input">
              </div>
              <!-- Amount -->
              <div>
                 <label for="amount" class="block text-sm font-medium mb-1">Amount</label>
                <input id="amount" type="number" formControlName="amount" placeholder="0.00" class="form-input">
              </div>
              <!-- Attachments -->
              <div class="sm:col-span-2">
                <label for="attachments" class="block text-sm font-medium mb-1">Bill Attachments (Up to 5 images)</label>
                <input id="attachments" type="file" multiple (change)="onFileSelected($event)" accept="image/*" class="form-input file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                @if (attachmentPreviews().length > 0) {
                   <div class="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
                     @for (preview of attachmentPreviews(); track $index) {
                       <div class="relative group">
                          <img [src]="preview" alt="Attachment preview" class="w-full h-16 object-cover rounded-md border border-slate-300 dark:border-slate-600">
                           <button type="button" (click)="removeAttachmentPreview($index)" class="absolute top-0 right-0 bg-red-500/80 hover:bg-red-600 text-white rounded-full p-0.5 m-1 transition-opacity opacity-0 group-hover:opacity-100" aria-label="Remove image">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                            </svg>
                          </button>
                       </div>
                     }
                   </div>
                }
              </div>
              <!-- Notes -->
               <div class="sm:col-span-2">
                <label for="notes" class="block text-sm font-medium mb-1">Notes (Optional)</label>
                <textarea id="notes" formControlName="notes" rows="3" placeholder="Any additional information..." class="form-input"></textarea>
              </div>
            </div>
            
            <!-- Modal Footer -->
            <div class="flex justify-end space-x-4 p-4 sm:p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
              <button type="button" (click)="closeAddEntryModal()" class="px-6 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors">
                Cancel
              </button>
              <button type="submit" [disabled]="addEntryForm.invalid" 
                      class="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors disabled:bg-indigo-400 dark:disabled:bg-indigo-800 disabled:cursor-not-allowed">
                {{ modalSubmitButtonText() }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

     <!-- Attachment Viewer Modal -->
    @if (isAttachmentViewerVisible()) {
      <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] animate-fade-in-fast" (click)="closeAttachmentViewer()">
        <button (click)="closeAttachmentViewer()" class="absolute top-4 right-4 text-white hover:text-slate-300 transition-colors z-[70]" aria-label="Close image viewer">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8"><path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" /></svg>
        </button>

        <div (click)="$event.stopPropagation()" class="relative flex items-center justify-center w-full h-full p-4">
          <!-- Main Image -->
          <img [src]="imagesForViewer()[currentAttachmentIndex()]" alt="Attachment {{ currentAttachmentIndex() + 1 }}" class="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl">
          
          <!-- Navigation -->
          @if (imagesForViewer().length > 1) {
            <!-- Previous Button -->
            <button (click)="prevAttachment()" class="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition-colors z-[70]" aria-label="Previous image">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M7.72 12.53a.75.75 0 0 1 0-1.06l7.5-7.5a.75.75 0 1 1 1.06 1.06L9.31 12l6.97 6.97a.75.75 0 1 1-1.06 1.06l-7.5-7.5Z" clip-rule="evenodd" /></svg>
            </button>
            <!-- Next Button -->
            <button (click)="nextAttachment()" class="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition-colors z-[70]" aria-label="Next image">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path fill-rule="evenodd" d="M16.28 11.47a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06-1.06L14.69 12 7.72 5.03a.75.75 0 0 1 1.06-1.06l7.5 7.5Z" clip-rule="evenodd" /></svg>
            </button>
             <!-- Counter -->
            <div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm rounded-full px-3 py-1 z-[70]">
              {{ currentAttachmentIndex() + 1 }} / {{ imagesForViewer().length }}
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .form-input {
      @apply w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LedgerDetailsComponent implements OnInit {
  // Use a default value for previewing the component standalone
  ledger = input<Ledger>({
    name: 'VIT',
    createdAt: new Date('2025-11-12'),
    entries: samplePreviewEntries,
  });
  close = output<void>();
  ledgerUpdate = output<Ledger>();

  private fb = inject(FormBuilder);
  
  isModalVisible = signal(false);
  editingEntryId = signal<string | null>(null);
  isCustomCategory = signal(false);
  
  // State for attachments
  attachmentPreviews = signal<string[]>([]);
  isAttachmentViewerVisible = signal(false);
  imagesForViewer = signal<string[]>([]);
  currentAttachmentIndex = signal(0);

  // State for exports
  isExportingExcel = signal(false);
  isExportingPdf = signal(false);

  private entries = signal<Entry[]>([]);
  
  // Computed state for modal UI
  modalTitle = computed(() => this.editingEntryId() ? 'Edit Entry' : 'Add Entry');
  modalSubmitButtonText = computed(() => this.editingEntryId() ? 'Update' : 'Add');

  // Summary calculations
  cashInTotal = computed(() => this.entries().filter(e => e.type === 'cash-in').reduce((sum, e) => sum + e.amount, 0));
  cashOutTotal = computed(() => this.entries().filter(e => e.type === 'cash-out').reduce((sum, e) => sum + e.amount, 0));
  balance = computed(() => this.cashInTotal() - this.cashOutTotal());

  // Table data with running balance
  entriesWithBalance = computed(() => {
    const sortedEntries = [...this.entries()].sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time}`);
      const dateB = new Date(`${b.date}T${b.time}`);
      return dateA.getTime() - dateB.getTime();
    });

    let runningBalance = 0;
    return sortedEntries.map(entry => {
      runningBalance += entry.type === 'cash-in' ? entry.amount : -entry.amount;
      return { ...entry, balance: runningBalance };
    });
  });

  addEntryForm = this.fb.group({
    type: ['cash-in' as 'cash-in' | 'cash-out', Validators.required],
    date: ['', Validators.required],
    time: ['', Validators.required],
    details: ['', Validators.required],
    category: ['Food', Validators.required],
    customCategory: [''],
    mode: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    notes: [''],
  });

  constructor() {
    effect(() => {
        this.addEntryForm.get('category')?.valueChanges.subscribe(value => {
            this.isCustomCategory.set(value === 'Custom');
            const customCategoryControl = this.addEntryForm.get('customCategory');
            if (value === 'Custom') {
                customCategoryControl?.setValidators([Validators.required]);
            } else {
                customCategoryControl?.clearValidators();
            }
            customCategoryControl?.updateValueAndValidity();
        });
    });
  }

  ngOnInit() {
    this.entries.set(this.ledger().entries);
  }
  
  openAddEntryModal(type: 'cash-in' | 'cash-out') {
    this.editingEntryId.set(null);
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0].substring(0, 5);

    this.addEntryForm.reset({
      type,
      date,
      time,
      category: 'Food',
      amount: null,
      details: '',
      mode: '',
      notes: ''
    });
    this.attachmentPreviews.set([]);
    this.isModalVisible.set(true);
  }

  openEditEntryModal(entry: Entry) {
    this.editingEntryId.set(entry.id);
    
    const isStandardCategory = ['Food', 'Transport', 'Advance', 'Health Care'].includes(entry.category);
    const categoryValue = isStandardCategory ? entry.category : 'Custom';

    this.addEntryForm.reset({
      type: entry.type,
      date: entry.date,
      time: entry.time,
      details: entry.details,
      category: categoryValue,
      customCategory: isStandardCategory ? '' : entry.category,
      mode: entry.mode,
      amount: entry.amount,
      notes: entry.notes || '',
    });

    this.attachmentPreviews.set(entry.attachments ?? []);
    this.isModalVisible.set(true);
  }

  closeAddEntryModal() {
    this.isModalVisible.set(false);
    this.editingEntryId.set(null);
    this.attachmentPreviews.set([]);
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const files = Array.from(input.files).slice(0, 5 - this.attachmentPreviews().length);

    const previewPromises = files
      .filter(file => file.type.startsWith('image/'))
      .map(file => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

    try {
      const newPreviews = await Promise.all(previewPromises);
      this.attachmentPreviews.update(current => [...current, ...newPreviews]);
    } catch (error) {
      console.error("Error reading file previews", error);
    }
  }

  removeAttachmentPreview(indexToRemove: number) {
    this.attachmentPreviews.update(current => current.filter((_, index) => index !== indexToRemove));
  }

  onSaveEntry() {
    if (this.addEntryForm.invalid) return;

    const formValue = this.addEntryForm.getRawValue();
    const currentId = this.editingEntryId();

    const entryData: Omit<Entry, 'id' | 'attachments'> & { attachments?: string[] } = {
      type: formValue.type!,
      date: formValue.date!,
      time: formValue.time!,
      details: formValue.details!,
      category: formValue.category === 'Custom' ? formValue.customCategory! : formValue.category!,
      mode: formValue.mode!,
      amount: formValue.amount!,
      attachments: this.attachmentPreviews(),
      notes: formValue.notes || undefined
    };

    let updatedEntries: Entry[];
    if (currentId) {
      // Update existing entry
      updatedEntries = this.entries().map(e => e.id === currentId ? { ...e, ...entryData } : e);
    } else {
      // Add new entry
      const newEntry: Entry = { ...entryData, id: new Date().getTime().toString() };
      updatedEntries = [...this.entries(), newEntry];
    }
    
    this.entries.set(updatedEntries);
    this.ledgerUpdate.emit({ ...this.ledger(), entries: updatedEntries });
    this.closeAddEntryModal();
  }
  
  deleteEntry(entryToDelete: Entry) {
    const updatedEntries = this.entries().filter(e => e.id !== entryToDelete.id);
    this.entries.set(updatedEntries);
    this.ledgerUpdate.emit({ ...this.ledger(), entries: updatedEntries });
  }

  openAttachmentViewer(attachments: string[]) {
    this.imagesForViewer.set(attachments);
    this.currentAttachmentIndex.set(0);
    this.isAttachmentViewerVisible.set(true);
  }

  closeAttachmentViewer() {
    this.isAttachmentViewerVisible.set(false);
    this.imagesForViewer.set([]);
  }

  nextAttachment() {
    this.currentAttachmentIndex.update(i => (i + 1) % this.imagesForViewer().length);
  }

  prevAttachment() {
    this.currentAttachmentIndex.update(i => (i - 1 + this.imagesForViewer().length) % this.imagesForViewer().length);
  }

  exportToExcel() {
    if (this.isExportingExcel()) return;
    this.isExportingExcel.set(true);

    // Use setTimeout to allow UI to update with loading spinner
    setTimeout(() => {
      try {
        const dataForExport = this.entriesWithBalance().map(entry => ({
          Date: new Date(entry.date + 'T' + entry.time).toLocaleString(),
          Details: entry.details,
          Category: entry.category,
          Mode: entry.mode,
          'Cash In': entry.type === 'cash-in' ? entry.amount : '',
          'Cash Out': entry.type === 'cash-out' ? entry.amount : '',
        }));

        const ws = XLSX.utils.json_to_sheet(dataForExport);

        // Add total and balance rows
        XLSX.utils.sheet_add_aoa(ws, [[]], { origin: -1 }); // Spacer row
        XLSX.utils.sheet_add_aoa(ws, [['TOTAL', '', '', '', this.cashInTotal(), this.cashOutTotal()]], { origin: -1 });
        XLSX.utils.sheet_add_aoa(ws, [['BALANCE', '', '', '', '', this.balance()]], { origin: -1 });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
        XLSX.writeFile(wb, `${this.ledger().name.replace(/\s/g, '_')}_ledger.xlsx`);
      } catch(e) {
        console.error('Error exporting to excel', e);
        alert('An error occurred while exporting to Excel.');
      } finally {
        this.isExportingExcel.set(false);
      }
    }, 100);
  }

  exportToPdf() {
    if (this.isExportingPdf()) return;
    this.isExportingPdf.set(true);

    setTimeout(async () => {
      try {
        const allAttachments = this.entries()
          .flatMap(entry => entry.attachments)
          .filter((att): att is string => !!att);

        if (allAttachments.length === 0) {
          alert('No attachments found to export.');
          return;
        }
        
        const { jsPDF } = (window as any).jspdf;
        const doc = new jsPDF();

        for (let i = 0; i < allAttachments.length; i++) {
          if (i > 0) {
            doc.addPage();
          }
          const imgData = allAttachments[i];

          await new Promise<void>(resolve => {
            const img = new Image();
            img.src = imgData;
            img.onload = () => {
              const pageHeight = doc.internal.pageSize.getHeight();
              const pageWidth = doc.internal.pageSize.getWidth();
              const imgHeight = img.height;
              const imgWidth = img.width;

              const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);

              const newWidth = imgWidth * ratio * 0.9; // 90% of page width
              const newHeight = imgHeight * ratio * 0.9; // 90% of page height

              const x = (pageWidth - newWidth) / 2;
              const y = (pageHeight - newHeight) / 2;
              
              doc.addImage(imgData, 'JPEG', x, y, newWidth, newHeight);
              resolve();
            }
          });
        }
        doc.save(`${this.ledger().name.replace(/\s/g, '_')}_bills.pdf`);

      } catch (e) {
        console.error('Error exporting to PDF', e);
        alert('An error occurred while exporting to PDF.');
      } finally {
        this.isExportingPdf.set(false);
      }
    }, 100);
  }
}