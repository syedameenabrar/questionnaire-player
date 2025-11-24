import {
  CSP_NONCE,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  booleanAttribute,
} from '@angular/core';
import {
  ApiConfiguration,
  Evidence,
  Question,
  Section,
} from '../../interfaces/questionnaire.type';
import { FormBuilder, FormGroup } from '@angular/forms';
import { QuestionnaireService } from '../../services/questionnaire.service';
import { MatDialog } from '@angular/material/dialog';
import { MainComponent } from '../main/main.component';
import { ApiService } from '../../services/api.service';
import { catchError } from 'rxjs/operators';
import * as urlConfig from '../../constants/url-config.json';
import { ToastService } from '../../services/toast.service';
import { ThemePalette } from '@angular/material/core';
import { ProgressSpinnerMode } from '@angular/material/progress-spinner';
import { firstValueFrom, Observable, Subscribable, Subscription } from 'rxjs';
import { AlertComponent } from '../alert/alert.component';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { SharedService } from '../../services/shared.service';
import { QueryParamsService } from '../../services/queryParams.service';
import { DbService } from '../../services/db/db.service';
import { AttachmentService } from '../../services/attachment/attachment.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'lib-main-wrapper',
  templateUrl: './main-wrapper.component.html',
  styleUrls: ['./main-wrapper.component.scss'],
})
export class MainWrapperComponent implements OnInit, OnChanges, OnDestroy {
  questions: Array<Question>;
  @Input({ transform: booleanAttribute }) angular = false;
  evidence: Evidence;
  sections: Section[];
  questionnaireForm: FormGroup;

  @Input() apiConfig: ApiConfiguration;
  @ViewChild('questionMapModal') public questionMapModal: TemplateRef<any>;
  @ViewChild('mainComponent') public mainComponent: MainComponent;
  questionMap = {};
  pageMsg = new Map();
  endDate: Date;
  sectionName: string;
  listing = false;
  assessment: any;
  loaded = false;
  color: ThemePalette = 'primary';
  mode: ProgressSpinnerMode = 'indeterminate';
  strokeWidth = 4;
  dialogRef: any;
  isExpired: boolean;
  @Input() saveQuestioner: boolean = false;
  subscription: Subscription;
  isOnline: boolean = true;
  stateData: any;
  submissionId: any;
  evidenceCode: any;
  solutionType: any;
  uploading: boolean = false;
  totalFileToUpload: any = 0;
  currentFileUploaded = 0;
  sectionIndex: any = 0;
  completedPages: number = 0;
  totalPages: number = 0;
  pageProgressValue: number = 0;
  questionNotStarted: boolean | null = null;
  initialized = false;
  isDateAutoSave:boolean = false;
  private _formValueChangesSub: Subscription | null = null;
  

  constructor(
    public fb: FormBuilder,
    private dialog: MatDialog,
    public questionnaireService: QuestionnaireService,
    public apiService: ApiService,
    public toaster: ToastService,
    public location: Location,
    private renderer: Renderer2, private el: ElementRef,
    public router: Router,
    private sharedService: SharedService,
    private queryParamsService: QueryParamsService,
    private db: DbService,
    private attachmentService: AttachmentService,
    private http: HttpClient,

  ) { }

  checkFormValidity() {
    window.parent.postMessage({
      type: 'formDirty',
      isDirty: this.questionnaireForm.dirty
    }, '*');
  }

  async ngOnChanges(changes: SimpleChanges) {
    let initialResponse:any; 

    if (
      this.angular &&
      changes['apiConfig'] &&
      changes['apiConfig'].previousValue == undefined &&
      changes['apiConfig'].currentValue
    ) {
      this.setApiService();
      let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();
      if (!isDataInlocalSotrage) {
        this.setApiService();
        initialResponse = this.apiService.stateData ? await this.getQuestions(this.apiService.stateData) : await this.fetchDetails();
      }


      setTimeout(async () => {
        if (Array.isArray(this.sections) && this.sections.length > 0) {
          await this.setSection(this.sectionIndex);
        } else {
          console.warn('Skipping setSection; sections not ready yet (ngOnInit/ngOnChanges).');
        }
      }, 1000);
  
    }

    if (changes['saveQuestioner']) {
      if (this.saveQuestioner == true) {
        this.submission('draft');
      }
    }
  }

  async ngOnInit() {
    this.loadInitialData();
    this.toaster.clearToaster();

    let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();
    if (typeof this.apiConfig === 'string') {
      try {
        this.apiConfig = JSON.parse(this.apiConfig);

        if (!isDataInlocalSotrage) {
          this.setApiService();
          this.apiService.stateData ? this.getQuestions(this.apiService.stateData) : this.fetchDetails();
        }

      } catch (error) {
        throw new Error('Invalid Assessment Structure', error);
      }
    }

    setTimeout(async () => {
      if (Array.isArray(this.sections) && this.sections.length > 0) {
        await this.setSection(this.sectionIndex);
      } else {
        console.warn('Skipping setSection; sections not ready yet (ngOnInit/ngOnChanges).');
      }
    }, 1000);


    this.questionnaireForm = this.fb.group({});

    this.questionnaireForm.valueChanges
    .subscribe((data: any) => {
      this.checkFormValidity();
    })

    this.attachmentService.trigger$.subscribe(() => {
      const evidenceData = this.questionnaireService.getEvidenceData(
        this.evidence,
        this.questionnaireForm.value
      );

      // evidenceData['status'] = 'draft';
      const submissionData = {
        status: evidenceData['isSubmitted'] ? "submit" : "draft",
        ...evidenceData,
      };

      this.updateDataInIndexDb(submissionData);
    });

  }

  
  async getQueryParms() {
    this.queryParamsService.parseQueryParams();
    this.submissionId = this.queryParamsService?.submissionId || this.submissionId || "";
    this.evidenceCode = this.queryParamsService?.evidenceCode || this.evidenceCode;
    this.sectionIndex = this.queryParamsService?.sectionIndex || 0;

    // if (!submissionId || !evidenceCode) {
    //   return null;
    // }

    return {
      indexDbKey: `${this.submissionId}`,
      evidenceCode: `${this.evidenceCode}`
    };
  }

  async setDataInIndexDb(submissionId: any) {
    const queryParamsData = await this.getQueryParms();
    const indexDbKey = queryParamsData?.indexDbKey;

    const data = {
      key: submissionId ? submissionId : indexDbKey,
      data: this.assessment
    }
    try {
      await this.db.addData(data);
    } catch (error) {
      console.error("Failed to store data in IndexedDB", error);
    }
  }

  getProgressStatus(submission: any): number {
    if (!submission || !submission.answers) return 0;
  
    const answersObj = submission.answers;
  
    let totalQuestions = 0;
    let answeredCount = 0;
  
    for (const qid of Object.keys(answersObj)) {
      const answer = answersObj[qid];
      const value = answer.value;
      const responseType = answer.responseType;
  
      const visibleIf = answer.visibleIf;
      if (Array.isArray(visibleIf) && visibleIf.length > 0) {
        let isVisible = false;
  
        for (const condition of visibleIf) {
          const targetQid = condition._id;
          const targetValue = condition.value?.[0];
          const operator = condition.operator;
          const targetAnswer = answersObj[targetQid];
  
          if (!targetAnswer || targetAnswer.value === undefined || targetAnswer.value === null) {
            isVisible = false;
            break;
          }
  
          const actualValue = targetAnswer.value;
          if (operator === '===' && actualValue === targetValue) {
            isVisible = true;
          }
        }
  
        if (!isVisible) continue;
      }
  
      totalQuestions++;
      let isAnswered = false;
      if (Array.isArray(value)) {
        isAnswered = value.some((v: any) => v && v.toString().trim() !== '');
      } else if (value !== undefined && value !== null) {
        const strVal = value.toString().trim();
        if (responseType === 'slider') {
          isAnswered = strVal !== '' && strVal !== '0' && strVal !== '1'; // ignore default 1
        } else {
          isAnswered = strVal !== '';
        }
      }
  
      if (isAnswered) answeredCount++;
    }
  
    if (totalQuestions === 0) return 0;
  
    return Math.round((answeredCount / totalQuestions) * 100);
  }
  
  async updateDataInIndexDb(updatedAnswers) {
    const queryParamsData = await this.getQueryParms();
    const indexDbKey = queryParamsData?.indexDbKey;
    const evidenceCode = queryParamsData?.evidenceCode;
    if (!indexDbKey || indexDbKey === 'undefined') {
      return false;
    }

    const assessmentClone = JSON.parse(JSON.stringify(this.assessment));
    const submissions = assessmentClone.assessment.submissions;
    const evidences = assessmentClone.assessment.evidences;
    const evidenceIndex = +this.apiConfig.index;


    if (!submissions[evidenceCode]) {
      submissions[evidenceCode] = {
        externalId: evidenceCode,
        answers: {},
        startTime: Date.now(),
        endTime: this.endDate,
        gpsLocation: null,
        submittedBy: '',
        submittedByName: '',
        submissionDate: new Date().toISOString(),
        isValid: true,
        status: 'draft',
        progressStatus: this.questionNotStarted ? 'notStarted' : 'inProgress',
        pageProgressValue: this.pageProgressValue,
        completePercentage: 0
      };
    }

    submissions[evidenceCode].answers = { ...updatedAnswers?.answers };
    submissions[evidenceCode].status = evidences[evidenceIndex].isSubmitted 
      ? 'save'
      : updatedAnswers?.status === 'draft'
        ? 'draft'
        : 'submit';


    const progress = this.getProgressStatus(submissions[evidenceCode]);
    let progressStatus = 'notStarted';
    if (progress === 100) progressStatus = 'completed';
    else if (progress > 0) progressStatus = 'inProgress';
    else if (!this.questionNotStarted) progressStatus = 'inProgress';

    this.calculatePageCompletion(submissions[evidenceCode]);

    evidences[evidenceIndex].completePercentage = progress;
    evidences[evidenceIndex].progressStatus = progressStatus;
    evidences[evidenceIndex].pageProgressValue = this.pageProgressValue;
    evidences[evidenceIndex].completedPages = this.completedPages;
    evidences[evidenceIndex].totalPages = this.totalPages;
    evidences[evidenceIndex].isSubmitted = ['save', 'submit'].includes(submissions[evidenceCode].status);

    const data = {
      key: indexDbKey,
      data: assessmentClone
    };

    try {
      await this.db.updateData(data);
      this.assessment = assessmentClone;

      return true;
    } catch (error) {
      console.error("❌ Failed to store data in IndexedDB", error);
      return false;
    }
  }

  async deleteFromIndexDb() {
    const queryParamsData = await this.getQueryParms();
    const indexDbKey = queryParamsData?.indexDbKey;
    this.db.deleteData(indexDbKey);
  }

  async checkAndMapIndexDbDataToVariables() {
    const queryParamsData = await this.getQueryParms();

    const indexDbKey = queryParamsData?.indexDbKey;
    let indexdbData = await this.db.getData(indexDbKey);
    let currentObservation = indexdbData?.data;

    if (this.solutionType === "survey") {
      const submissions = currentObservation?.assessment?.submissions;
      if (submissions && typeof submissions === 'object') {
        this.evidenceCode = Object.keys(submissions)[0];
      }
    }
    if (currentObservation) {
      this.assessment = this.questionnaireService.mapSubmissionToAssessment(
        currentObservation
      );
      this.evidence = this.solutionType == 'observation' ? currentObservation?.assessment?.evidences[+[this.apiConfig.index]] : currentObservation?.assessment?.evidences[0];
      this.evidenceCode=this.evidence.code;
      this.pageProgressValue = this.evidence?.pageProgressValue || 0;
      this.completedPages = this.evidence?.completedPages || 0;
      this.totalPages = this.evidence?.totalPages || 0;
      this.evidence.startTime = Date.now();
      this.endDate = new Date(
        new Date(currentObservation?.assessment?.endDate).getTime() +
        new Date(currentObservation?.assessment?.endDate).getTimezoneOffset() *
        60000
      );
      this.isExpired = currentObservation?.assessment?.status == 'expired' || false;
      this.sections = this.evidence?.sections;

      this.setSection(this.sectionIndex);

      this.questionnaireForm = this.fb.group({});

      this.questionnaireForm.valueChanges.subscribe((data: any) => {
        this.checkFormValidity();
      })
      this.loaded = true;
    }
    return currentObservation ? true : false;
  }

  setApiService() {
    this.apiService.baseUrl = this.apiConfig.baseURL;
    this.apiService.token = this.apiConfig.userAuthToken;
    this.apiService.solutionType = this.apiConfig.solutionType || 'observation';
    this.apiService.observationId = this.apiConfig.observationId;
    this.apiService.entityId = this.apiConfig.entityId;
    this.apiService.submissionNumber = this.apiConfig.submissionNumber;
    this.apiService.evidenceCode = this.apiConfig.evidenceCode;
    this.apiService.index = this.apiConfig.index;

    this.apiService.profileData = this.apiConfig.profileData;
    this.apiService.stateData = this.apiConfig.stateData;

    this.stateData = this.apiConfig.stateData;
    this.solutionType = this.apiConfig.solutionType || 'observation';
    this.getQueryParms();

  }

  async fetchDetails() {
    const path = this.solutionType == 'observation' ? this.apiConfig.observationId + `?entityId=${this.apiConfig.entityId}&submissionNumber=${this.apiConfig.submissionNumber}&evidenceCode=${this.apiConfig.evidenceCode}` : this.apiConfig.solutionId


    this.subscription = this.apiService.post(`${urlConfig[this.solutionType].details}` + path, this.apiConfig.profileData)
      .pipe(
        catchError((err) => {
          throw new Error('Could not fetch the details');
        })
      )
      .subscribe(async (res: any) => {
        if (!res.result) {
          this.surveyExpired(res)
          return;
        }


        if (res.result) {
          this.assessment = this.questionnaireService.mapSubmissionToAssessment(
            res.result
          );

          this.submissionId = this.assessment.assessment.submissionId;
          this.evidenceCode = this.assessment.assessment.evidences[0].code;


          let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();
          this.enableDisableStartBtn(this.assessment.assessment.evidences[0]);
          if (!isDataInlocalSotrage) {

            this.setDataInIndexDb(this.submissionId);

            this.evidence = this.solutionType == 'observation' ? this.assessment?.assessment?.evidences[+[this.apiConfig.index]] : this.assessment?.assessment?.evidences[0];
            this.evidence.startTime = Date.now();
            this.endDate = new Date(
              new Date(this.assessment?.assessment?.endDate).getTime() +
              new Date(this.assessment?.assessment?.endDate).getTimezoneOffset() *
              60000
            );
            this.isExpired = this.assessment?.assessment?.status == 'expired';
            this.sections = this.evidence?.sections;
            this.loaded = true;

          }

        } else {
          this.toaster.showToast('Something went wrong, Please try again later', 'danger', 5000)
        }

      });
  }



  getQuestionMap() {
    for (
      let sectionIndex = 0;
      sectionIndex < this.sections.length;
      sectionIndex++
    ) {
      for (
        let questionIndex = 0;
        questionIndex < this.sections[sectionIndex].questions.length;
        questionIndex++
      ) {
        this.questionMap[
          `${this.sections[sectionIndex].name} - Page ${questionIndex + 1}`
        ] = [];
        if (
          this.sections[sectionIndex].questions[questionIndex].responseType ==
          'pageQuestions'
        ) {
          for (
            let pqIndex = 0;
            pqIndex <
            this.sections[sectionIndex].questions[questionIndex].pageQuestions
              .length;
            pqIndex++
          ) {
            if (
              (Array.isArray(
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].visibleIf
              ) &&
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].canDisplay) ||
              !Array.isArray(
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].visibleIf
              )
            ) {
              let value =
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].value;
              if (
                !this.questionnaireForm.controls[
                  this.sections[sectionIndex].questions[questionIndex]
                    .pageQuestions[pqIndex]._id
                ].valid
              ) {
                value = [];
              }
              if (
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].responseType == 'slider'
              ) {
                this.pageMsg.set(
                  `${this.sections[sectionIndex].name} - Page ${questionIndex + 1}`,
                  'Please review your response to the slider question on this page'
                );
              }
              this.setQuestionMap(
                sectionIndex,
                questionIndex,
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].validation,
                value,
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex]._id,
                this.sections[sectionIndex].questions[questionIndex]
                  .pageQuestions[pqIndex].questionNumber
              );
            }
          }
        } else {
          if (
            (Array.isArray(
              this.sections[sectionIndex].questions[questionIndex].visibleIf
            ) &&
              this.sections[sectionIndex].questions[questionIndex]
                .canDisplay) ||
            !Array.isArray(
              this.sections[sectionIndex].questions[questionIndex].visibleIf
            )
          ) {
            let value =
              this.sections[sectionIndex].questions[questionIndex].value;
            if (
              !this.questionnaireForm.controls[
                this.sections[sectionIndex].questions[questionIndex]._id
              ].valid
            ) {
              value = [];
            }
            if (
              this.sections[sectionIndex].questions[questionIndex]
                .responseType == 'slider'
            ) {
              this.pageMsg.set(
                `${this.sections[sectionIndex].name} - Page ${questionIndex + 1}`,
                'Please review your response to the slider question on this page'
              );
            }
            this.setQuestionMap(
              sectionIndex,
              questionIndex,
              this.sections[sectionIndex].questions[questionIndex].validation,
              value,
              this.sections[sectionIndex].questions[questionIndex]._id,
              this.sections[sectionIndex].questions[questionIndex]
                .questionNumber
            );
          }
        }
      }
    }
    this.dialog.open(this.questionMapModal, {
      width: 'auto',
      enterAnimationDuration: 300,
      exitAnimationDuration: 150,
      disableClose: true,
      hasBackdrop: true,
    });
  }

  setQuestionMap(sectionIndex, qIndex, qValidation, qValue, questionId, qNum) {
    const validation = qValidation;
    const value = qValue;
    const question = {
      _id: questionId,
      validity:
        (value && value.length > 0) || Number.isInteger(value)
          ? '#006600'
          : typeof validation !== 'string' && validation.required
            ? '#A30000'
            : '#595959',
      sectionName: this.sections[sectionIndex].name,
      pageIndex: qIndex,
      questionNumber: qNum,
    };
    this.questionMap[`${this.sections[sectionIndex].name} - Page ${qIndex + 1}`].push(
      question
    );
  }

  enableRelevantPage() {
    for (let i = 0; i < this.sections.length; i++) {
      if (this.sections[i].name !== this.sectionName) {
        this.domQuery(this.sections[i].name, 'none');
      }
    }

    this.domQuery(this.sectionName, 'block');
    if (document.getElementById('observation-ion-toolbar')) {
      document.getElementById('observation-ion-toolbar').style.display = 'block'
    }

  }

  domQuery(elemendId: string, action: string) {
    if (document.getElementById(`${elemendId}`)) {
      document.getElementById(`${elemendId}`).style.display = action;
    }
  }

  async submission(status) {
    const evidenceData = this.questionnaireService.getEvidenceData(
      this.evidence,
      this.questionnaireForm.value
    );

    status == 'save' ? (evidenceData['status'] = 'draft') : null;
    const submissionData = {
      status: status,
      ...evidenceData,
    };
    await this.submitSurvey(submissionData);
  }

  async submitImageToCloud(payload: any, uploadQueue: any[]): Promise<any[]> {
    try {
      const response: any = await firstValueFrom(
        this.apiService.post(urlConfig.presignedUrl, payload)
      );
      const submissionId = Object.keys(response.result).find(
        (key) => key !== 'cloudStorage'
      );

      const fileList = response.result[submissionId]?.files || [];
      const uploadResults: any[] = [];

      for (let file of uploadQueue) {
        const presignedUrlData = fileList.find((f: any) => f.file === file.name);

        if (!presignedUrlData) {
          console.error(`Presigned URL not found for file: ${file.name}`);
          continue;
        }

        const headers = new HttpHeaders({
          'Content-Type': 'multipart/form-data',
          'x-ms-blob-type': 'BlockBlob',
        });

        const storedFile: any = await this.db.getData(file.name);
        if (storedFile?.data) {
          const convertedFile = this.attachmentService.base64ToFile(storedFile.data);
          file.file = convertedFile;
        }


        await firstValueFrom(
          this.http.put(presignedUrlData.url, file.file, { headers })
        );

        file.isUploaded = true;
        file.url = presignedUrlData.url;
        file.previewUrl = presignedUrlData.getDownloadableUrl[0];
        file.sourcePath = presignedUrlData.payload?.sourcePath || '';
        this.currentFileUploaded++;

        uploadResults.push(file);
      }

      return uploadResults;

    } catch (err) {
      console.error('Batch upload failed', err);
      throw err;
    }
  }

  async submitSurvey(submissionData) {
    if (submissionData.status !== 'draft') {
      this.isDateAutoSave = true;
  
      if (!this.saveQuestioner) {
        const confirmationParams = {
          title: 'Confirmation',
          message: `Are you sure you want to submit the ${this.solutionType}?`,
          actionBtns: true,
          cancelLabel: 'Cancel',
          acceptLabel: 'Confirm',
        };
  
        const response = await this.openAlert(confirmationParams);
        if (!response) return;
  
        this.totalFileToUpload = 0;
        this.currentFileUploaded = 0;
  
        const answers = submissionData?.answers;
        const uploadQueue: any[] = [];
  
        for (let [submissionId, answerObj] of Object.entries(answers)) {
          const files = (answerObj as any).fileName || [];
          for (let file of files) {
            if (!file?.isUploaded) {
              this.totalFileToUpload++;
              const storedFile: any = await this.db.getData(file.name);
              if (!storedFile || !storedFile.data) {
                this.toaster.showToast(`No stored data found for file: ${file.name}`, 'danger', 5000);
                continue;
              }
              file.submissionId = submissionId;
              uploadQueue.push(file);
            }
          }
        }
  
        this.uploading = true;
  
        try {
          if (uploadQueue.length > 0) {
            const payload = {
              ref: 'survey',
              request: {
                [this.submissionId]: {
                  files: uploadQueue.map(file => file.name)
                }
              }
            };
  
            const uploadedFiles = await this.submitImageToCloud(payload, uploadQueue);
  
            for (let i = 0; i < uploadQueue.length; i++) {
              const file = uploadQueue[i];
              const presignedUrlData = uploadedFiles[i];
              file.isUploaded = true;
              file.previewUrl = presignedUrlData.previewUrl;
              file.url = presignedUrlData.url;
              file.sourcePath = presignedUrlData.sourcePath;
              this.currentFileUploaded++;
            }
  
            await this.updateDataInIndexDb(submissionData);
          }
        } catch (uploadErr) {
          console.error('Batch upload failed:', uploadErr);
          this.toaster.showToast(`Failed to upload files`, 'danger', 5000);
          this.uploading = false;
          return;
        } finally {
          this.uploading = false;
        }
      }
      const filteredSubmissionData = JSON.parse(JSON.stringify(submissionData));
      if (filteredSubmissionData.answers) {
        for (let [submissionId, answerObj] of Object.entries(filteredSubmissionData.answers)) {
          const files = (answerObj as any).fileName || [];
          (answerObj as any).fileName = files.filter(f => f.isUploaded);
        }
      }

      this.apiService
        .post(
          `${urlConfig[this.solutionType].update}${this.assessment.assessment.submissionId}`,
          { evidence: filteredSubmissionData }
        )
        .pipe(
          catchError((err) => {
            const errorMsg = err?.error?.message || 'Submission failed';
            this.toaster.showToast(errorMsg, 'danger', 5000);
            throw err;
          })
        )
        .subscribe(async (res: any) => {
          if (res.status === 200 && !this.saveQuestioner) {
            await this.updateDataInIndexDb(submissionData);
  
            this.formIsNotDirty();
            const footer = this.el.nativeElement.querySelector('.footer-buttons');
            this.renderer.setStyle(footer, 'display', 'none');
            this.toaster.showToast(
              `Your ${this.solutionType} has been submitted successfully.`,
              'success',
              5000
            );
            this.evidence.isSubmitted = true;
  
            setTimeout(() => {
              this.location.back();
            }, 1000);
          } else {
            this.toaster.showToast(res?.message || 'Submission failed', 'danger', 5000);
            this.evidence.isSubmitted = false;
            await this.updateDataInIndexDb({ ...submissionData, status: 'draft' });
          }
        });
  
    } else {
      const responseFromUpdateDataFunction = await this.updateDataInIndexDb(submissionData);
      if (responseFromUpdateDataFunction && !this.saveQuestioner) {
        this.formIsNotDirty();
        if (this.questionnaireForm.dirty && !this.isDateAutoSave) {
          const message = { type: 'PROGRAMS', data: 'Your changes have been saved.' };
          window.postMessage(message, '*');
          this.toaster.showToast(`Your changes have been saved.`, 'success', 5000);
        }
        this.isDateAutoSave = false;
      }
    }
  }
  

  async openAlert(alertDialogConfig) {
    const dialogRef = await this.dialog.open(AlertComponent, {
      data: alertDialogConfig,
      width: 'auto',
      enterAnimationDuration: 300,
      exitAnimationDuration: 150,
      disableClose: true
    });

    this.dialogRef = dialogRef

    return new Observable<boolean>((observer) => {
      dialogRef.afterClosed().subscribe((res) => {
        if (res) {
          this.dialogRef.close();
        }
        observer.next(res);
        observer.complete();
      });
    }).toPromise();
  }

  async setSection(index: any, skipEnableDisableStartBtn:any = false) {
    if (!Array.isArray(this.sections) || this.sections.length === 0) {
      console.warn('setSection called before sections are available. sectionIndex:', index, 'sections:', this.sections);
      return;
    }
    let idx = Number(index);
    if (Number.isNaN(idx) || !Number.isFinite(idx)) {
      idx = 0;
    }
    idx = Math.max(0, Math.min(idx, this.sections.length - 1));
    this.sectionIndex = idx;
    const section = this.sections[idx];
    if (!section) {
      console.warn('No section found at index', idx, 'sections length', this.sections.length);
      return;
    }
    this.sectionName = section.name;
    this.enableRelevantPage();
    this.mainComponent?.enableRelevantPage();
    if (this._formValueChangesSub) {
      this._formValueChangesSub.unsubscribe();
    }

    this._formValueChangesSub = this.questionnaireForm?.valueChanges
      ?.pipe(debounceTime(500), distinctUntilChanged())
      .subscribe((data: any) => {
        if (!data || !this.evidence) return;

        const evidenceData = this.questionnaireService.getEvidenceData(this.evidence, data);
        if (!evidenceData?.answers) return;

        const submissionData = {
          status: evidenceData['isSubmitted'] ? "submit" : "draft",
          ...evidenceData,
        };
        this.updateDataInIndexDb(submissionData).then(() => {});
      });

    if(!skipEnableDisableStartBtn){
      setTimeout(() => {
        if (this.evidence) {
          this.enableDisableStartBtn(this.evidence);
        }
      }, 50);
    }
  }

  closeModal() {
    this.dialog.closeAll();
  }

  goToQuestion(questonId, pageIndex, sectionIndex) {
    this.setSection(sectionIndex, true)
    this.mainComponent.pageIndex = pageIndex;
    this.mainComponent.handlePageEvent({ pageIndex: pageIndex, questonId:questonId });
    this.closeModal();
  }

  formIsNotDirty() {
    window.parent.postMessage({
      type: 'formDirty',
      isDirty: false
    }, '*');
  }

  async ngOnDestroy() {
    // if (this.questionnaireForm.dirty) {
    //   await this.submission('save');
    // }
      await this.submission('save');


    // this.toaster.clearToaster()
    // if (this.solutionType == 'observation' && this.questionnaireForm.dirty) {
    //   this.saveQuestioner = true;
    //   if (!this.assessment.assessment.evidences[0].isSubmitted) {
    //     await this.submission('draft');
    //   }

      this.subscription?.unsubscribe();
      this.sharedService.updateValue(false);
      // this.questionnaireForm.reset();
      if (document.getElementById('observation-ion-toolbar')) {
        document.getElementById('observation-ion-toolbar').style.display = 'block';
      }
    // }
  }

  async getQuestions(data) {
    if (data?.isATargetedSolution === false) {
      this.toaster.showToast('Dear User, this Observation is not relevant for your subrole and location', 'danger', 5000)
    }

    this.assessment = this.questionnaireService.mapSubmissionToAssessment(
      data
    );
    this.submissionId = this.assessment.assessment.submissionId;
    this.evidenceCode = this.assessment.assessment.evidences[this.sectionIndex].code;
    this.apiConfig.index = this.sectionIndex;
    let isDataInlocalSotrage = await this.checkAndMapIndexDbDataToVariables();
    if(this.submissionId){
      this.setDataInIndexDb(this.submissionId);
    }
    if (!isDataInlocalSotrage) {
      this.evidence = this.solutionType == 'observation' ? this.assessment?.assessment?.evidences[+[this.apiConfig.index]] : this.assessment?.assessment?.evidences[0];
      this.evidence.startTime = Date.now();
      this.endDate = new Date(
        new Date(this.assessment?.assessment?.endDate).getTime() +
        new Date(this.assessment?.assessment?.endDate).getTimezoneOffset() *
        60000
      );
      this.isExpired = this.assessment?.assessment?.status == 'expired';
      this.sections = this.evidence?.sections;
      this.loaded = true;
    }
  }

  surveyExpired(data) {
    const message = { type: 'EXPIRED', data: data };
    window.postMessage(message, '*');
  }

  calculatePageCompletion(submission: any) {
    if (!submission || !submission.answers || !this.sections) return;
  
    let totalPages = 0;
    let completedPages = 0;
    const answersObj = submission.answers;

    this.sections.forEach((section) => {
      section.questions.forEach((q:any) => {

        if (Array.isArray(q.visibleIf) && !q.canDisplay) {
          return;
        }

        if (q.responseType === 'pageQuestions') {
          totalPages++;
          const allAnswered = q.pageQuestions.every((pq:any) => {
            if (Array.isArray(pq.visibleIf) && !pq.canDisplay) {
              return true;
            }

            const ans = submission.answers[pq._id]?.value;
            const required = pq.validation?.required;
  
            if (required) {
              return Array.isArray(ans)
                ? ans.some(v => v !== '' && v != null)
                : ans !== undefined && ans !== null && ans.toString().trim() !== '';
            } else {
              return true;
            }
          });
  
          if (allAnswered) completedPages++;
        } else {
          totalPages++;
          const ans = submission.answers[q._id]?.value;
          const required = q.validation?.required;
  
          const isAnswered = required
            ? (Array.isArray(ans)
                ? ans.some(v => v !== '' && v != null)
                : ans !== undefined && ans !== null && ans.toString().trim() !== '')
            : true;
  
          if (isAnswered) completedPages++;
        }
      });
    });
  
    this.totalPages = totalPages;
    this.completedPages = completedPages;
    this.calculatePageProgressValue();
  }

  calculatePageProgressValue(){
    this.pageProgressValue = this.totalPages > 0
    ? Math.round((this.completedPages / this.totalPages) * 100)
    : 0;
  }

  async startQuestioner() {
    const { observationAsTask, isATargetedSolution } = this.stateData || {};
    if(this.questionNotStarted && this.stateData?.isSurvey){
      this.questionNotStarted = false;
      this.evidence.progressStatus = "inProgress";
      await this.submission('save');
      return
    } 

    if (observationAsTask || isATargetedSolution) {
      const message = { type: 'START', data: this.stateData };
      window.postMessage(message, '*');
    } 
    else {
      this.toaster.showToast(
        'Dear User, this Observation is not relevant for your subrole and location',
        'danger',
        5000
      );
    }
  }
  
  enableDisableStartBtn(evidence){
    if (!evidence) return;

    if(evidence?.isSubmitted){
      this.questionNotStarted = false;
    }else if(this.solutionType === "survey"){
      this.questionNotStarted = false;
    }else if(!evidence?.isSubmitted && (!evidence?.progressStatus || evidence?.progressStatus == 'notStarted')){
      this.questionNotStarted = true;
    }else{
      this.questionNotStarted = false;
    }
    this.initialized = true;
  }

  async loadInitialData() {
    try {
      await this.checkAndMapIndexDbDataToVariables();
    } finally {
      this.loaded = false; // Only hide after state mapping done
    }

}
}

