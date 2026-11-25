-- Raw events keep their own IDs, dates and deletion flags.
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SELECT PT.RecId AS MovementId,PT.ProductivitySerialCardId AS SerialCardId,
 PT.InOut,P.ProcessName,PT.ProcessId,PT.IsRepair,
 CASE WHEN PT.ProductivityDate IS NULL OR PT.ProductivityTime IS NULL THEN NULL ELSE
 DATEADD(SECOND,DATEDIFF(SECOND,CONVERT(date,PT.ProductivityTime),PT.ProductivityTime),CONVERT(datetime,CONVERT(date,PT.ProductivityDate))) END AS EventAt,
 PT.InsertedAt,PT.UpdatedAt,PT.IsDeleted,PT.DeletedAt,
 ER.EmployeeDisplayName,PT.EmployeeId,PT.InsertedBy AS CreatedById,U.UserName AS CreatedByName,
 PT.UpdatedBy AS UpdatedById,UU.UserName AS UpdatedByName,
 R.Explanation AS ResourceName,A.CurrentAccountName AS FactoryName
FROM dbo.MA_ProductivityTransactions PT
LEFT JOIN dbo.MA_Process P ON P.RecId=PT.ProcessId
LEFT JOIN dbo.MA_Resource R ON R.RecId=PT.ResourceId
LEFT JOIN dbo.FI_Account A ON A.RecId=PT.FactoryId
LEFT JOIN dbo.MD_User U ON U.RecId=PT.InsertedBy
LEFT JOIN dbo.MD_User UU ON UU.RecId=PT.UpdatedBy
OUTER APPLY (SELECT CASE WHEN COUNT(DISTINCT RR.Explanation)=1 THEN MIN(RR.Explanation) END AS EmployeeDisplayName FROM dbo.MA_Resource RR WHERE RR.EmployeeId=PT.EmployeeId AND NULLIF(LTRIM(RTRIM(RR.Explanation)),'') IS NOT NULL) ER
WHERE PT.RecId IN (SELECT RecId FROM #ChangedMove) AND PT.ProductivitySerialCardId IN (SELECT RecId FROM #ChangedSerial);
